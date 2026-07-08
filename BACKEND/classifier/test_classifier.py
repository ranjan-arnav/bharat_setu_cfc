"""
Direct 50-case test against local classifier (port 5001).
No Next.js, no Phi. Pure local model accuracy test.
Run: python test_classifier.py
"""
import urllib.request, json, sys

TESTS = [
    # ── NAGARIK_MITRA (10) ──────────────────────────────────────────────────
    ("nagarik_mitra", "paani nahi aa raha hai teen din se"),
    ("nagarik_mitra", "bijli gul hai subah se mohalle mein"),
    ("nagarik_mitra", "sadak pe bade gaddhe hain gaadi kharab hai"),
    ("nagarik_mitra", "nali block ho gayi hai gali mein paani bhar gaya"),
    ("nagarik_mitra", "kachara utha nahi raha safai wale nahi aate"),
    ("nagarik_mitra", "birth certificate banana hai nagarpalika se"),
    ("nagarik_mitra", "padosi mera paani ka connection chura raha hai pipeline se"),
    ("nagarik_mitra", "RTI file karni hai municipality ke khilaf"),
    ("nagarik_mitra", "bijli ka meter kharab hai reading galat aa rahi hai"),
    ("nagarik_mitra", "open manhole on road near school very dangerous"),

    # ── SWASTHYA_SAHAYAK (10) ─────────────────────────────────────────────────
    ("swasthya_sahayak", "meri tabiyat bilkul thik nahi hai pet mein dard hai"),
    ("swasthya_sahayak", "bukhaar aa raha hai 3 din se dawai nahi kar rahi"),
    ("swasthya_sahayak", "bacche ko polio vaccine lagwana hai kahan jaun"),
    ("swasthya_sahayak", "aankhon mein jalan aur dard ho raha hai infection lagta hai"),
    ("swasthya_sahayak", "pregnant hoon kya government hospital free delivery deta hai"),
    ("swasthya_sahayak", "khansi 2 hafte se hai doctor se milna hai"),
    ("swasthya_sahayak", "paani pine se typhoid ho gaya hai doctor chahiye"),
    ("swasthya_sahayak", "mera BP bahut high ho gaya hai kya karoon"),
    ("swasthya_sahayak", "baccha underweight hai aanganwadi mein poshan milta hai"),
    ("swasthya_sahayak", "contaminated water se bachche beemar ho rahe hain nearest PHC"),

    # ── YOJANA_SAATHI (10) ────────────────────────────────────────────────────
    ("yojana_saathi", "PM KISAN ka paisa 2 mahine se account mein nahi aaya"),
    ("yojana_saathi", "pradhan mantri awas yojana gramin ke liye apply karna hai"),
    ("yojana_saathi", "vidhwa pension yojana mein naam kaise darj karein"),
    ("yojana_saathi", "beti ki padhai ke liye scholarship chahiye SC category"),
    ("yojana_saathi", "ujjwala yojana gas connection kaise milega"),
    ("yojana_saathi", "MGNREGA job card banana hai narega mein kaam chahiye"),
    ("yojana_saathi", "kisan credit card ke liye apply karna hai"),
    ("yojana_saathi", "bijli subsidy yojana gareeb parivar ke liye"),
    ("yojana_saathi", "old age pension government scheme 60 saal se upar"),
    ("yojana_saathi", "fasal bima yojana ke liye registration kaise karein"),

    # ── ARTHIK_SALAHKAR (10) ──────────────────────────────────────────────────
    ("arthik_salahkar", "OTP leke bank se 15000 nikal liye cyber fraud"),
    ("arthik_salahkar", "mudra loan lena hai chai ka thela shuru karne ke liye"),
    ("arthik_salahkar", "UPI se galat payment gayi wapas kaise aayegi"),
    ("arthik_salahkar", "online fraud hua paisa dobara milega kya"),
    ("arthik_salahkar", "bank account mein paisa freeze ho gaya kya karein"),
    ("arthik_salahkar", "personal loan ke liye eligibility kya hai sarkari bank"),
    ("arthik_salahkar", "credit score badhane ke tarike kya hain"),
    ("arthik_salahkar", "koi fake call aaya SBI agent bola OTP liya"),
    ("arthik_salahkar", "EPFO PF withdrawal kaise karein online"),
    ("arthik_salahkar", "ration card se PM KISAN link nahi hua bank problem"),

    # ── VIDHI_SAHAYAK (10) ────────────────────────────────────────────────────
    ("vidhi_sahayak", "police FIR likhne se mana kar rahi hai teen baar gaya"),
    ("vidhi_sahayak", "bhai ne meri zameen pe kabza kar liya vakeel chahiye"),
    ("vidhi_sahayak", "domestic violence ho rahi hai ghar mein legal help chahiye"),
    ("vidhi_sahayak", "consumer court mein complaint karna hai product kharab tha"),
    ("vidhi_sahayak", "NALSA se muft kanuni madad chahiye"),
    ("vidhi_sahayak", "builder ne flat ka possession nahi diya legal notice"),
    ("vidhi_sahayak", "online fraud ke liye FIR darz karni hai cyber crime"),
    ("vidhi_sahayak", "police ne bina wajah arrest kar liya bail kaise milegi"),
    ("vidhi_sahayak", "पुलिस एफआईआर दर्ज करने से मना कर रही है वकील चाहिए"),
    ("vidhi_sahayak", "zameen ke fake documents banaye hain complaint karna hai"),
]

assert len(TESTS) == 50, f"Expected 50 tests, got {len(TESTS)}"

def classify(text):
    body = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:5001/classify",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.load(r)

print("\n╔══════════════════════════════════════════════════════╗")
print("║  BHARAT SETU — LOCAL CLASSIFIER TEST (50 cases)     ║")
print("╚══════════════════════════════════════════════════════╝\n")

passed = failed = 0
failures = []

for i, (expected, text) in enumerate(TESTS, 1):
    try:
        result = classify(text)
        pred = result["agent"]
        conf = result["confidence"]
        ok = pred == expected
        icon = "✅" if ok else "❌"
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append((i, expected, pred, conf, text))
        print(f"{icon} [{i:02d}] conf={conf:.2f} | {pred:<20} | {text[:65]}")
    except Exception as e:
        failed += 1
        failures.append((i, expected, "ERROR", 0, text))
        print(f"💥 [{i:02d}] ERROR: {e} | {text[:60]}")

print(f"\n{'═'*60}")
score = f"{passed}/50"
bar = "█" * passed + "░" * (50 - passed)
print(f"SCORE: {score}  [{bar}]")
print(f"PASS: {passed}  FAIL: {failed}")
threshold = passed >= 45
print(f"THRESHOLD (45/50): {'✅ MET' if threshold else '❌ NOT MET'}")

if failures:
    print(f"\nFailed cases:")
    for i, exp, pred, conf, text in failures:
        print(f"  [{i:02d}] expected={exp} got={pred}({conf:.2f})")
        print(f"       text: {text[:70]}")

print(f"{'═'*60}\n")
sys.exit(0 if threshold else 1)
