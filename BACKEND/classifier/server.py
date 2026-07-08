"""
Local intent classifier + NER server for Bharat Setu.
Loads the trained TF-IDF + LinearSVC model and serves predictions on port 5001.
Also exposes a spaCy-backed entity extraction endpoint for execution-layer autofill.
Run: python server.py
"""
import os, re, joblib
from flask import Flask, request, jsonify

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.pkl')
app = Flask(__name__)
model = None
nlp = None
finance_subintent_model = None
civic_risk_model = None

FINANCE_SUBINTENTS = [
    'bank_deposit',
    'investment_guidance',
    'upi_issue',
    'loan_query',
    'fraud_alert',
    'general_finance',
]

FINANCE_SUBINTENT_DATA = [
    ('bank_deposit', 'how to deposit cash in bank'),
    ('bank_deposit', 'pls help how to deposit money in bank'),
    ('bank_deposit', 'cash deposit machine process'),
    ('bank_deposit', 'how to fill pay in slip for cash deposit'),
    ('bank_deposit', 'cheque deposit kaise karein'),
    ('bank_deposit', 'branch mein paise jama kaise karte hain'),
    ('investment_guidance', 'where should i invest money safely'),
    ('investment_guidance', 'investment advice for beginners in india'),
    ('investment_guidance', 'sip mutual fund kaise start kare'),
    ('investment_guidance', 'long term wealth creation options'),
    ('investment_guidance', 'i want to invest money where to invest'),
    ('investment_guidance', 'risk profile ke hisab se investment plan'),
    ('upi_issue', 'upi payment failed what to do'),
    ('upi_issue', 'money debited but not credited in upi'),
    ('upi_issue', 'pending upi transaction refund kab aayega'),
    ('upi_issue', 'wrong upi transfer dispute process'),
    ('upi_issue', 'utr number se complaint kaise karein'),
    ('upi_issue', 'upi app dispute ticket raise karna hai'),
    ('loan_query', 'mudra loan apply process'),
    ('loan_query', 'home loan eligibility check'),
    ('loan_query', 'personal loan emi planning'),
    ('loan_query', 'business loan for small shop'),
    ('loan_query', 'loan interest rate compare kaise karein'),
    ('loan_query', 'loan sanction letter samajhna hai'),
    ('fraud_alert', 'otp share kar diya account se paisa kat gaya'),
    ('fraud_alert', 'cyber fraud complaint where to report'),
    ('fraud_alert', 'scam call ne bank details le liye'),
    ('fraud_alert', 'unauthorized transaction from my account'),
    ('fraud_alert', 'phishing link pe click ho gaya'),
    ('fraud_alert', 'upi fraud report 1930'),
    ('general_finance', 'how to save money monthly'),
    ('general_finance', 'financial suggestions for household budget'),
    ('general_finance', 'bank account basic information'),
    ('general_finance', 'general finance guidance needed'),
    ('general_finance', 'money management tips for beginners'),
    ('general_finance', 'personal finance planning basics'),
]

CIVIC_RISK_DATA = [
    ('critical', 'transformer blast and electric sparks near school emergency'),
    ('critical', 'major water pipeline burst flooding homes immediate help needed'),
    ('critical', 'sewage overflow near hospital causing severe health emergency'),
    ('critical', 'road collapse with accident risk ambulance cannot pass'),
    ('critical', 'no water for 5 days in entire ward urgent tanker required'),
    ('critical', 'live wire fallen on street immediate danger to citizens'),
    ('critical', 'garbage fire smoke in dense market area'),
    ('critical', 'dengue outbreak risk due to stagnant sewage water'),
    ('high', 'multiple potholes on main road causing daily traffic disruptions'),
    ('high', 'streetlights not working on highway stretch safety concern at night'),
    ('high', 'drainage blockage causing repeated overflow every evening'),
    ('high', 'water pressure very low in full neighborhood for many days'),
    ('high', 'garbage not collected for one week attracting stray animals'),
    ('high', 'frequent power cuts in market area affecting businesses'),
    ('high', 'sewer leakage near residential lane bad smell and insects'),
    ('high', 'road shoulder broken near bus stop accident likelihood'),
    ('medium', 'streetlight flickering near ward office please inspect'),
    ('medium', 'minor pothole outside colony gate needs patchwork'),
    ('medium', 'irregular garbage collection in one lane'),
    ('medium', 'water supply delay in morning slot for two blocks'),
    ('medium', 'drain cleaning required before monsoon starts'),
    ('medium', 'voltage fluctuation complaints from a few homes'),
    ('medium', 'civic complaint filed for damaged manhole cover'),
    ('medium', 'request for preventive cleaning in market road'),
]

ISSUE_TERMS = [
    'streetlight', 'pothole', 'garbage', 'drain', 'sewage', 'water',
    'pipeline', 'electricity', 'transformer', 'road', 'hospital',
    'ambulance', 'fraud', 'scam', 'loan', 'ration', 'pension',
    'scholarship', 'scheme', 'complaint'
]

DEPARTMENT_RULES = [
    ('Electrical Department', ['streetlight', 'electricity', 'transformer']),
    ('Water and Drainage Department', ['water', 'pipeline', 'sewage', 'drain']),
    ('Public Works Department', ['road', 'pothole']),
    ('Sanitation Department', ['garbage', 'sanitation', 'waste']),
    ('Health Department', ['hospital', 'ambulance', 'doctor', 'medical']),
    ('Police and Legal Services', ['police', 'fir', 'court', 'legal']),
]

CATEGORY_RULES = [
    ('health', ['hospital', 'doctor', 'ambulance', 'health', 'medical', 'clinic']),
    ('legal', ['police', 'fir', 'court', 'legal', 'lawyer', 'cybercrime']),
    ('finance', ['loan', 'bank', 'upi', 'fraud', 'scam', 'credit']),
    ('scheme', ['scheme', 'yojana', 'pension', 'ration', 'scholarship', 'benefit']),
    ('civic', ['streetlight', 'pothole', 'road', 'water', 'garbage', 'drain', 'sewage', 'electricity', 'municipal']),
]


def has_whole_term(text: str, term: str) -> bool:
    return re.search(rf'\b{re.escape(term)}\b', text, re.IGNORECASE) is not None


def detect_department(text: str):
    lower = text.lower()
    for dept, terms in DEPARTMENT_RULES:
        if any(has_whole_term(lower, term) for term in terms):
            return dept
    return None


def detect_category(text: str):
    lower = text.lower()
    for category, terms in CATEGORY_RULES:
        if any(has_whole_term(lower, term) for term in terms):
            return category
    return 'general'


def train_finance_subintent_model():
    try:
        from sklearn.pipeline import Pipeline
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression

        texts = [sample for _, sample in FINANCE_SUBINTENT_DATA]
        labels = [label for label, _ in FINANCE_SUBINTENT_DATA]

        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=3000)),
            ('clf', LogisticRegression(max_iter=800, class_weight='balanced')),
        ])
        pipeline.fit(texts, labels)
        return pipeline
    except Exception as ex:
        print(f"[classifier] finance subintent ML unavailable: {ex}")
        return None


def train_civic_risk_model():
    try:
        from sklearn.pipeline import Pipeline
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression

        texts = [sample for _, sample in CIVIC_RISK_DATA]
        labels = [label for label, _ in CIVIC_RISK_DATA]

        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=4000)),
            ('clf', LogisticRegression(max_iter=1000, class_weight='balanced')),
        ])
        pipeline.fit(texts, labels)
        return pipeline
    except Exception as ex:
        print(f"[classifier] civic risk ML unavailable: {ex}")
        return None


def classify_finance_subintent_rule(text: str):
    lower = text.lower()

    if re.search(r'fraud|scam|phishing|otp|unauthori[sz]ed|cyber|1930', lower):
        return 'fraud_alert', 0.89
    if re.search(r'upi|utr|pending|refund|chargeback|transaction failed|money debited', lower):
        return 'upi_issue', 0.84
    if re.search(r'loan|emi|interest|mudra|sanction|disburs|borrow', lower):
        return 'loan_query', 0.83
    if re.search(r'deposit|cash deposit|pay[- ]?in slip|cdm|cheque deposit|जमा', lower):
        return 'bank_deposit', 0.86
    if re.search(r'\binvest\b|investment|mutual fund|sip|portfolio|asset allocation|where to invest', lower):
        return 'investment_guidance', 0.82

    return 'general_finance', 0.62


def classify_civic_risk_rule(text: str):
    lower = text.lower()

    if re.search(r'blast|electrocut|collapsed|life threat|emergency|urgent|fire|flood|outbreak|fallen wire', lower):
        return 'critical', 0.86

    if re.search(r'overflow|overflowing|high traffic|highway|not working|not collected|repeated|many days|safety concern', lower):
        return 'high', 0.78

    return 'medium', 0.68


def fallback_issue(text: str):
    lower = text.lower()
    for term in ISSUE_TERMS:
        if has_whole_term(lower, term):
            return term
    issue_match = re.search(r'(?:issue|problem|complaint|regarding|about)\s+(?:of\s+)?([a-zA-Z\s]{3,40})', text, re.IGNORECASE)
    if issue_match:
        return ' '.join(issue_match.group(1).strip().split()[:3]).lower()
    return None


def fallback_location(text: str):
    patterns = [
        r'\bin\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?=\s+(?:not|is|was|working|broken|with|due|because)\b|[,.!?]|$)',
        r'\b(?:at|near|around|from)\s+([a-zA-Z][a-zA-Z\s]{1,30}?)(?=\s+(?:in|near|at|not|is|was|working|broken|with|due|because)\b|[,.!?]|$)',
        r'\b(?:village|ward|district|sector|city|town)\s+([a-zA-Z0-9\-\s]{1,35})\b',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            location = re.sub(r'\s+(is|was|not|broken|working|issue)$', '', match.group(1).strip(), flags=re.IGNORECASE)
            if re.search(r'\sin\s', location, re.IGNORECASE):
                location = re.split(r'\sin\s', location, flags=re.IGNORECASE)[-1]
            if len(location) >= 2:
                return location.title()
    return None


def extract_entities(text: str):
    issue = fallback_issue(text)
    location = fallback_location(text)
    department = detect_department(text)
    person = None
    source = 'fallback'

    if callable(nlp):
        doc = nlp(text)
        source = 'spacy'
        for ent in doc.ents:
            if ent.label_ == 'PERSON' and not person:
                person = ent.text.strip()
            elif ent.label_ in ('GPE', 'LOC', 'FAC') and not location:
                location = ent.text.strip().title()

        if not issue:
            for chunk in doc.noun_chunks:
                candidate = chunk.text.strip().lower()
                if any(term in candidate for term in ISSUE_TERMS):
                    issue = next((term for term in ISSUE_TERMS if term in candidate), candidate)
                    break

        if (fallback_issue(text) and issue != fallback_issue(text)) or (fallback_location(text) and location != fallback_location(text)):
            source = 'hybrid'

    category = detect_category(' '.join(filter(None, [text, issue or '', department or ''])))
    signal_count = sum(1 for value in [issue, location, department, person] if value)

    if source == 'spacy':
        confidence = min(0.96, 0.68 + signal_count * 0.08)
    elif source == 'hybrid':
        confidence = min(0.93, 0.64 + signal_count * 0.08)
    else:
        confidence = min(0.86, 0.5 + signal_count * 0.09)

    return {
        'issue': issue,
        'location': location,
        'department': department,
        'person': person,
        'category': category,
        'source': source,
        'confidence': round(confidence, 2),
    }

@app.before_request
def load_model():
    global model, nlp, finance_subintent_model, civic_risk_model
    if model is None:
        if not os.path.exists(MODEL_PATH):
            return jsonify({"error": "Model not trained yet. Run train.py first."}), 503
        model = joblib.load(MODEL_PATH)
    if nlp is None:
        try:
            import spacy  # local import to keep startup robust when spaCy is missing
            nlp = spacy.load(os.environ.get('SPACY_MODEL', 'en_core_web_sm'))
        except Exception:
            nlp = False
    if finance_subintent_model is None:
        finance_subintent_model = train_finance_subintent_model()
    if civic_risk_model is None:
        civic_risk_model = train_civic_risk_model()

@app.route('/classify', methods=['POST'])
def classify():
    data = request.get_json(force=True, silent=True) or {}
    text = str(data.get('text', '')).strip()
    if not text:
        return jsonify({"error": "empty text"}), 400

    pred = model.predict([text])[0]
    proba = model.predict_proba([text])[0]
    classes = model.classes_
    scores = dict(zip(classes, [round(float(p), 4) for p in proba]))
    conf = round(float(max(proba)), 4)

    return jsonify({
        "agent": pred,
        "confidence": conf,
        "scores": scores,
    })

@app.route('/extract', methods=['POST'])
def extract():
    data = request.get_json(force=True, silent=True) or {}
    text = str(data.get('text', '')).strip()
    if not text:
        return jsonify({"error": "empty text"}), 400

    entities = extract_entities(text)
    return jsonify(entities)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "spacy_loaded": bool(nlp),
        "finance_subintent_model_loaded": finance_subintent_model is not None,
        "civic_risk_model_loaded": civic_risk_model is not None,
    })


@app.route('/classify-finance', methods=['POST'])
def classify_finance():
    data = request.get_json(force=True, silent=True) or {}
    text = str(data.get('text', '')).strip()
    if not text:
        return jsonify({"error": "empty text"}), 400

    if finance_subintent_model is not None:
        try:
            pred = str(finance_subintent_model.predict([text])[0])
            proba = finance_subintent_model.predict_proba([text])[0]
            classes = list(finance_subintent_model.classes_)
            scores = dict(zip(classes, [round(float(p), 4) for p in proba]))
            conf = round(float(max(proba)), 4)
            return jsonify({
                "subintent": pred,
                "confidence": conf,
                "scores": scores,
                "source": "ml",
            })
        except Exception:
            pass

    subintent, confidence = classify_finance_subintent_rule(text)
    return jsonify({
        "subintent": subintent,
        "confidence": confidence,
        "scores": {subintent: confidence},
        "source": "rule-fallback",
    })


@app.route('/predict-civic-risk', methods=['POST'])
def predict_civic_risk():
    data = request.get_json(force=True, silent=True) or {}
    text = str(data.get('text', '')).strip()
    if not text:
        return jsonify({"error": "empty text"}), 400

    score_map = {
        'critical': 90,
        'high': 74,
        'medium': 56,
    }

    if civic_risk_model is not None:
        try:
            pred = str(civic_risk_model.predict([text])[0])
            proba = civic_risk_model.predict_proba([text])[0]
            classes = list(civic_risk_model.classes_)
            scores = dict(zip(classes, [round(float(p), 4) for p in proba]))
            confidence = round(float(max(proba)), 4)
            base_score = score_map.get(pred, 56)
            risk_score = int(round(base_score * (0.8 + confidence * 0.2)))
            return jsonify({
                "risk_level": pred,
                "risk_score": max(40, min(97, risk_score)),
                "confidence": confidence,
                "scores": scores,
                "source": "ml",
            })
        except Exception:
            pass

    risk_level, confidence = classify_civic_risk_rule(text)
    return jsonify({
        "risk_level": risk_level,
        "risk_score": score_map.get(risk_level, 56),
        "confidence": confidence,
        "scores": {risk_level: confidence},
        "source": "rule-fallback",
    })

if __name__ == '__main__':
    # Pre-load model at startup
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        print(f"[classifier] Model loaded from {MODEL_PATH}")
    else:
        print(f"[classifier] WARNING: No model.pkl found. Run train.py first.")
    finance_subintent_model = train_finance_subintent_model()
    if finance_subintent_model is not None:
        print("[classifier] Finance subintent ML loaded (TF-IDF + LogisticRegression)")
    else:
        print("[classifier] Finance subintent running in rule-fallback mode")
    civic_risk_model = train_civic_risk_model()
    if civic_risk_model is not None:
        print("[classifier] Civic risk ML loaded (TF-IDF + LogisticRegression)")
    else:
        print("[classifier] Civic risk running in rule-fallback mode")
    print("[classifier] Listening on http://localhost:5001")
    app.run(host='127.0.0.1', port=5001, debug=False)
