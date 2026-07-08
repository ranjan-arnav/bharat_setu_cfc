"""
200-case comprehensive test against local classifier (port 5001).
40 cases per agent — diverse linguistics, edge cases, ambiguous queries.
Run: python test_200.py
"""
import urllib.request, json, sys, time

TESTS = [
    # ── NAGARIK_MITRA (40) ──────────────────────────────────────────────────
    ("nagarik_mitra","paani nahi aa raha hai teen din se"),
    ("nagarik_mitra","bijli gul hai subah se mohalle mein"),
    ("nagarik_mitra","sadak pe bade gaddhe hain gaadi kharab ho gayi"),
    ("nagarik_mitra","nali block ho gayi gali mein paani bhar gaya"),
    ("nagarik_mitra","kachara utha nahi raha safai wale nahi aate"),
    ("nagarik_mitra","birth certificate banana hai nagarpalika se"),
    ("nagarik_mitra","padosi mera paani ka connection chura raha hai"),
    ("nagarik_mitra","bijli ka meter kharab hai reading galat aa rahi"),
    ("nagarik_mitra","RTI file karni hai municipality ke khilaf"),
    ("nagarik_mitra","open manhole near school very dangerous"),
    ("nagarik_mitra","caste certificate ke liye apply karna hai offline"),
    ("nagarik_mitra","water supply pipe phoot gayi sadak par"),
    ("nagarik_mitra","transformer phook gaya hai pure area mein blackout"),
    ("nagarik_mitra","street light kharab hai 2 hafte se koi nahi aaya"),
    ("nagarik_mitra","sewer overflow ho raha hai road blocked hai"),
    ("nagarik_mitra","property tax online kaise bhara jaayega"),
    ("nagarik_mitra","ration card mein address change karna hai"),
    ("nagarik_mitra","voter ID card correction karna hai naam me galti"),
    ("nagarik_mitra","death certificate urgent chahiye 3 din mein"),
    ("nagarik_mitra","income certificate banwana hai government job ke liye"),
    ("nagarik_mitra","पानी नहीं आ रहा है तीन दिन से"),
    ("nagarik_mitra","बिजली गुल है सुबह से मोहल्ले में"),
    ("nagarik_mitra","सड़क में गड्ढे हैं गाड़ी पलट सकती है"),
    ("nagarik_mitra","जन्म प्रमाण पत्र बनवाना है नगरपालिका से"),
    ("nagarik_mitra","निगम में शिकायत दर्ज करनी है पानी के बारे में"),
    ("nagarik_mitra","paani ki pipe phoot gayi road pe complaint karna"),
    ("nagarik_mitra","garbage truck 5 din se nahi aaya complaint"),
    ("nagarik_mitra","bijli ka naya connection chahiye residential area"),
    ("nagarik_mitra","domicile certificate apply karna hai online"),
    ("nagarik_mitra","locality mein pora andhera hai streetlight nahi"),
    ("nagarik_mitra","water shortage 4 din colony mein paani nahi"),
    ("nagarik_mitra","nagarpalika mein road complaint kaise darj karein"),
    ("nagarik_mitra","pothole on main road causing daily accidents"),
    ("nagarik_mitra","sewage line blocked entire street flooded"),
    ("nagarik_mitra","electricity connection new house apply karna"),
    ("nagarik_mitra","building permission naksha pass karana hai"),
    ("nagarik_mitra","noise pollution complaint factory se raat ko"),
    ("nagarik_mitra","paani nai aawe hai hamaar ghar ke paas kal bhi"),
    ("nagarik_mitra","batti nahi aai raat bhar transformer kharab ba"),
    ("nagarik_mitra","birth certificate urgently needed hospital se"),

    # ── SWASTHYA_SAHAYAK (40) ─────────────────────────────────────────────────
    ("swasthya_sahayak","meri tabiyat bilkul thik nahi hai pet mein dard"),
    ("swasthya_sahayak","bukhaar aa raha hai 3 din se dawai nahi kar rahi"),
    ("swasthya_sahayak","bacche ko polio vaccine lagwana hai kahan jaun"),
    ("swasthya_sahayak","aankhon mein jalan aur dard ho raha infection"),
    ("swasthya_sahayak","pregnant hoon government hospital free delivery"),
    ("swasthya_sahayak","khansi 2 hafte se hai doctor se milna hai"),
    ("swasthya_sahayak","paani pine se typhoid ho gaya doctor chahiye"),
    ("swasthya_sahayak","mera BP bahut high ho gaya hai kya karoon"),
    ("swasthya_sahayak","baccha underweight hai aanganwadi mein poshan"),
    ("swasthya_sahayak","contaminated water se bachche beemar nearest PHC"),
    ("swasthya_sahayak","dengue ke lakshan hain rash platelet kam hua"),
    ("swasthya_sahayak","ayushman bharat card banana hai hospital ke liye"),
    ("swasthya_sahayak","TB tuberculosis DOTS treatment kahan milega free"),
    ("swasthya_sahayak","heart attack symptoms feel ho rahe hain kya karein"),
    ("swasthya_sahayak","depression anxiety bahut zyada ho mental health help"),
    ("swasthya_sahayak","diabetes blood sugar control nahi ho raha help"),
    ("swasthya_sahayak","child vaccination schedule DPT measles rubella"),
    ("swasthya_sahayak","108 ambulance call karna hai emergency"),
    ("swasthya_sahayak","free cancer screening nearest government hospital"),
    ("swasthya_sahayak","malaria blood test free PHC mein hota hai"),
    ("swasthya_sahayak","तबियत ठीक नहीं है पेट में दर्द हो रहा है"),
    ("swasthya_sahayak","बुखार आ रहा है तीन दिन से"),
    ("swasthya_sahayak","बच्चे को पोलियो वैक्सीन लगवानी है"),
    ("swasthya_sahayak","आयुष्मान कार्ड से इलाज कराना है"),
    ("swasthya_sahayak","डेंगू के लक्षण हैं डॉक्टर से मिलना है"),
    ("swasthya_sahayak","hamar tabiyat thik nahi ba kal se bukhar hai"),
    ("swasthya_sahayak","baccha ke bukhar nahi utarta PHC kab khulela"),
    ("swasthya_sahayak","snake bite ho gaya antivenin hospital kahan"),
    ("swasthya_sahayak","jal jaana chemical burn hospital chahiye"),
    ("swasthya_sahayak","anemia hemoglobin 7 free treatment sarkari"),
    ("swasthya_sahayak","PMJAY premium free card eligibility check"),
    ("swasthya_sahayak","nearest PHC government clinic OPD timing"),
    ("swasthya_sahayak","free dialysis center nearest kidney failure"),
    ("swasthya_sahayak","blood pressure medication change doctor visit"),
    ("swasthya_sahayak","pregnancy week 32 pain doctor urgently"),
    ("swasthya_sahayak","child diarrhea ORS dehydration treatment"),
    ("swasthya_sahayak","mental health helpline suicidal thoughts"),
    ("swasthya_sahayak","fever 3 din se hai medicine not working"),
    ("swasthya_sahayak","AIIMS appointment online book kaise karein"),
    ("swasthya_sahayak","JSY janani suraksha yojana paise kab milenge"),

    # ── YOJANA_SAATHI (40) ────────────────────────────────────────────────────
    ("yojana_saathi","PM KISAN ka paisa 2 mahine se account mein nahi"),
    ("yojana_saathi","pradhan mantri awas yojana gramin apply karna hai"),
    ("yojana_saathi","vidhwa pension mein naam kaise darj karein"),
    ("yojana_saathi","beti ki padhai scholarship SC category UP"),
    ("yojana_saathi","ujjwala yojana gas connection kaise milega"),
    ("yojana_saathi","MGNREGA job card banana hai narega kaam chahiye"),
    ("yojana_saathi","kisan credit card ke liye apply karna hai"),
    ("yojana_saathi","fasal bima yojana ke liye registration kaise"),
    ("yojana_saathi","old age pension government scheme 60 saal"),
    ("yojana_saathi","bijli subsidy yojana gareeb parivar ke liye"),
    ("yojana_saathi","PM KISAN ka paisa 2 mahine se account mein nahi aaya"),
    ("yojana_saathi","PMAY urban housing subsidy EWS category mein"),
    ("yojana_saathi","NSP scholarship OBC students renew karna hai"),
    ("yojana_saathi","MGNREGA 100 din kaam ki guarantee nahi mili"),
    ("yojana_saathi","kisan maandhan pension scheme registration"),
    ("yojana_saathi","fasal sahayata yojana crop loss claim kaise"),
    ("yojana_saathi","Sukanya Samridhi account open karna hai beti ke liye"),
    ("yojana_saathi","PM SVANidhi loan street vendors ke liye"),
    ("yojana_saathi","Jal Jeevan Mission nal connection kab milega"),
    ("yojana_saathi","Swachh Bharat toilet subsidy gramin mein"),
    ("yojana_saathi","पीएम किसान का पैसा दो महीने से अकाउंट में नहीं आया"),
    ("yojana_saathi","प्रधानमंत्री आवास योजना के लिए आवेदन करना है"),
    ("yojana_saathi","विधवा पेंशन योजना में नाम कैसे दर्ज करें"),
    ("yojana_saathi","मनरेगा जॉब कार्ड बनाना है नरेगा में काम चाहिए"),
    ("yojana_saathi","फसल बीमा योजना में रजिस्ट्रेशन कैसे करें"),
    ("yojana_saathi","kisan yojana ka paisa nahi aail 3 mahine se"),
    ("yojana_saathi","pension ke paise khata mein kab aahi vidhwa"),
    ("yojana_saathi","ration card APL BPL AAY eligibility check karna"),
    ("yojana_saathi","eNAM portal kisan online mandi registration"),
    ("yojana_saathi","PM KISAN installment account credited nahi hui"),
    ("yojana_saathi","NPS Atal Pension Yojana bank account enroll"),
    ("yojana_saathi","PMFBY crop insurance premium kab katega account"),
    ("yojana_saathi","SHG Self Help Group loan yojana mahila scheme"),
    ("yojana_saathi","indira gandhi old age pension IGNOAPS amount"),
    ("yojana_saathi","one nation one ration card apply karna hai"),
    ("yojana_saathi","PM KISAN mein registration kaise karein naye kisan"),
    ("yojana_saathi","housing lottery affordable online apply"),
    ("yojana_saathi","scholarship NSP post matric OBC ST SC apply"),
    ("yojana_saathi","PM Ujjwala 2.0 LPG connection free milega"),
    ("yojana_saathi","soil health card kab milega meri khet ke liye"),

    # ── ARTHIK_SALAHKAR (40) ──────────────────────────────────────────────────
    ("arthik_salahkar","OTP leke bank se 15000 nikal liye cyber fraud"),
    ("arthik_salahkar","mudra loan lena hai chai ka thela shuru karna"),
    ("arthik_salahkar","UPI se galat payment gayi wapas kaise aayegi"),
    ("arthik_salahkar","online fraud hua paisa dobara milega kya"),
    ("arthik_salahkar","bank account freeze ho gaya kya karein"),
    ("arthik_salahkar","personal loan ke liye eligibility kya hai"),
    ("arthik_salahkar","credit score badhane ke tarike kya hain"),
    ("arthik_salahkar","fake SBI agent OTP liya phone pe"),
    ("arthik_salahkar","EPFO PF withdrawal online kaise karein"),
    ("arthik_salahkar","ration card PM KISAN link nahi hua bank problem"),
    ("arthik_salahkar","cyber crime complaint karna hai 1930 number"),
    ("arthik_salahkar","ITR income tax return 2024-25 file karna hai"),
    ("arthik_salahkar","mutual fund SIP invest karna hai monthly"),
    ("arthik_salahkar","PPF account mein maximum deposit kitna karein"),
    ("arthik_salahkar","term insurance claim reject hua kya karein"),
    ("arthik_salahkar","PhonePe payment pending refund nahi aaya"),
    ("arthik_salahkar","TDS refund kab aayega bank account mein"),
    ("arthik_salahkar","credit card debt trap kaise niklen"),
    ("arthik_salahkar","PMSBY accident insurance 2 lakh apply karna"),
    ("arthik_salahkar","NPS tier 1 tier 2 difference and withdrawal"),
    ("arthik_salahkar","ओटीपी लेकर बैंक से पैसे निकाल लिए साइबर फ्रॉड"),
    ("arthik_salahkar","मुद्रा लोन लेना है व्यवसाय के लिए"),
    ("arthik_salahkar","यूपीआई से गलत पेमेंट हो गई वापस कैसे आएगी"),
    ("arthik_salahkar","बैंक अकाउंट फ्रीज हो गया क्या करें"),
    ("arthik_salahkar","पीएफ विदड्रॉल ऑनलाइन कैसे करें"),
    ("arthik_salahkar","mera OTP le ke paisa nikal gaye fraud hua"),
    ("arthik_salahkar","loan ke liye apply karna hai business ke liye"),
    ("arthik_salahkar","UPI transfer galat ho gail hai wapas kaise"),
    ("arthik_salahkar","PF ke paise nikalne hai kaise karein"),
    ("arthik_salahkar","insurance claim nahi mila company se help"),
    ("arthik_salahkar","FASTag recharge nahi ho raha toll problem"),
    ("arthik_salahkar","investment fraud company ne paise nahi diye"),
    ("arthik_salahkar","home loan EMI miss ho gayi penalty waive"),
    ("arthik_salahkar","gold loan interest rate comparison banks"),
    ("arthik_salahkar","GST registration small business ke liye"),
    ("arthik_salahkar","EPFO UAN activate karna hai portal se"),
    ("arthik_salahkar","credit card chori ho gayi block karna"),
    ("arthik_salahkar","NACH mandate cancel karna EMI stop"),
    ("arthik_salahkar","ATM card clone hua paise withdrawal nahi"),
    ("arthik_salahkar","SIM swap fraud account accesshack hua"),

    # ── VIDHI_SAHAYAK (40) ────────────────────────────────────────────────────
    ("vidhi_sahayak","police FIR likhne se mana kar rahi hai"),
    ("vidhi_sahayak","bhai ne meri zameen pe kabza kar liya vakeel"),
    ("vidhi_sahayak","domestic violence ho rahi ghar mein legal help"),
    ("vidhi_sahayak","consumer court mein complaint product kharab"),
    ("vidhi_sahayak","NALSA se muft kanuni madad chahiye"),
    ("vidhi_sahayak","builder ne flat ka possession nahi diya legal"),
    ("vidhi_sahayak","online fraud ke liye FIR darz cyber crime"),
    ("vidhi_sahayak","police ne bina wajah arrest kar liya bail"),
    ("vidhi_sahayak","पुलिस एफआईआर दर्ज करने से मना कर रही है वकील चाहिए"),
    ("vidhi_sahayak","zameen ke fake documents banaye complaint"),
    ("vidhi_sahayak","zero FIR file karna hai dusre ilaake mein"),
    ("vidhi_sahayak","dowry demand ho rahi hai 498A case kaise"),
    ("vidhi_sahayak","RERA complaint builder flat delay compensation"),
    ("vidhi_sahayak","labour court mein wages nahi mile complaint"),
    ("vidhi_sahayak","tenant nahi nikal raha eviction notice kaise"),
    ("vidhi_sahayak","anticipatory bail kaise milein session court se"),
    ("vidhi_sahayak","SC ST atrocity act FIR kaise likhwayein"),
    ("vidhi_sahayak","consumer forum online complaint ecommerce fraud"),
    ("vidhi_sahayak","will testament property dispute sibling mein"),
    ("vidhi_sahayak","workplace harassment ICC complaint procedure"),
    ("vidhi_sahayak","पुलिस ने बिना वजह गिरफ्तार किया जमानत चाहिए"),
    ("vidhi_sahayak","जमीन पर भाई ने कब्जा किया वकील की जरूरत"),
    ("vidhi_sahayak","घरेलू हिंसा हो रही है कानूनी मदद चाहिए"),
    ("vidhi_sahayak","उपभोक्ता न्यायालय में शिकायत कैसे करें"),
    ("vidhi_sahayak","एनएएलएसए से मुफ्त कानूनी मदद कैसे मिलेगी"),
    ("vidhi_sahayak","police FIR refuse kar rahi hai rights kya hain"),
    ("vidhi_sahayak","zameen jhagda court mein jaana hai vakeel"),
    ("vidhi_sahayak","muft vakeel kahan milenge garib ko NALSA"),
    ("vidhi_sahayak","bail bond amount magistrate katna hai"),
    ("vidhi_sahayak","landlord bijli paani band kiya tenant hun legal"),
    ("vidhi_sahayak","fake sale deed property fraud cancel karna"),
    ("vidhi_sahayak","lok adalat mein settlement karna hai"),
    ("vidhi_sahayak","gratuity nahi mili employer ne 5 saal baad"),
    ("vidhi_sahayak","FIR दर्ज नहीं हुई पुलिस नहीं सुन रही है"),
    ("vidhi_sahayak","भूमि विवाद में वकील की जरूरत है"),
    ("vidhi_sahayak","police FIR nahi likh rahi kahan jaayein"),
    ("vidhi_sahayak","court mein case dakhil karne ki madad chahiye"),
    ("vidhi_sahayak","doctor negligence complaint state medical council"),
    ("vidhi_sahayak","cyber stalking ke liye FIR complaint online"),
    ("vidhi_sahayak","child custody case divorce mein kaun jeeta"),
]

assert len(TESTS) == 200, f"Expected 200, got {len(TESTS)}"

def classify(text, timeout=6):
    body = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:5001/classify",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

print("\n╔══════════════════════════════════════════════════════════╗")
print("║  BHARAT SETU — LOCAL CLASSIFIER TEST (200 cases)        ║")
print("╚══════════════════════════════════════════════════════════╝\n")

passed = failed = errors = 0
failures = []
per_class = {}

t_start = time.time()
for i, (expected, text) in enumerate(TESTS, 1):
    try:
        result = classify(text)
        pred = result["agent"]
        conf = result["confidence"]
        ok = pred == expected
        per_class.setdefault(expected, []).append(ok)
        icon = "✅" if ok else "❌"
        if ok:
            passed += 1
        else:
            failed += 1
            failures.append((i, expected, pred, conf, text))
        print(f"{icon} [{i:03d}] conf={conf:.2f} {pred:<22} {text[:55]}")
    except Exception as e:
        errors += 1
        failed += 1
        failures.append((i, expected, "ERROR", 0.0, text))
        print(f"💥 [{i:03d}] ERROR: {e}")

elapsed = time.time() - t_start

print(f"\n{'═'*62}")
bar = "█" * passed + "░" * (200 - passed)
print(f"SCORE: {passed}/200  [{bar[:60]}]")
print(f"PASS: {passed}  FAIL: {failed}  ERRORS: {errors}  TIME: {elapsed:.1f}s")

print(f"\nPer-class accuracy:")
for cls, results in sorted(per_class.items()):
    acc = sum(results) / len(results)
    bar2 = "█" * sum(results) + "░" * (len(results) - sum(results))
    print(f"  {cls:<25} {sum(results):>3}/{len(results)} [{bar2}]")

threshold = passed >= 180
print(f"\nTHRESHOLD (180/200): {'✅ MET' if threshold else '❌ NOT MET'}")

if failures:
    print(f"\nFailed cases (first 20):")
    for i, exp, pred, conf, text in failures[:20]:
        print(f"  [{i:03d}] exp={exp} got={pred}({conf:.2f})")
        print(f"        {text[:70]}")

print(f"{'═'*62}\n")
sys.exit(0 if threshold else 1)
