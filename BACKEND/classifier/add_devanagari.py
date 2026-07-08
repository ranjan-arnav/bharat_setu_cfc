"""Add Devanagari vidhi_sahayak examples directly"""
import os

path = os.path.join(os.path.dirname(__file__), 'train.py')

# These are Devanagari vidhi_sahayak examples with key legal terms
NEW = """
# MORE DEVANAGARI VIDHI_SAHAYAK examples
("vidhi_sahayak","पुलिस एफआईआर दर्ज करने से मना कर रही है वकील चाहिए"),
("vidhi_sahayak","पुलिस ने FIR लिखने से मना किया"),
("vidhi_sahayak","थाने में मेरी रिपोर्ट नहीं लिखी वकील चाहिए"),
("vidhi_sahayak","जमीन का विवाद है कानूनी सहायता चाहिए"),
("vidhi_sahayak","वकील की जरूरत है घरेलू हिंसा के लिए"),
("vidhi_sahayak","पुलिस ने गलत तरीके से गिरफ्तार किया जमानत चाहिए"),
("vidhi_sahayak","साइबर क्राइम के लिए FIR दर्ज करनी है"),
("vidhi_sahayak","कोर्ट में केस दाखिल करना है कानूनी मदद"),
("vidhi_sahayak","एफआईआर नहीं लिखी जा रही है थाने में"),
("vidhi_sahayak","भाई ने जमीन पर कब्जा किया वकील चाहिए"),
("vidhi_sahayak","बिल्डर ने फ्लैट नहीं दिया कानूनी नोटिस"),
"""

content = open(path, encoding='utf-8').read()
# Insert before the closing ] of DATA
target = '\n]\n\n#'
insert_before = ']\n\n#'
if target in content:
    # Find the last occurrence (end of DATA)
    idx = content.rfind(target)
    new_content = content[:idx] + NEW + content[idx:]
    open(path, 'w', encoding='utf-8').write(new_content)
    # Count total examples
    count = new_content.count('("vidhi_sahayak"')
    print(f"Done. vidhi_sahayak examples now: {count}")
else:
    print("TARGET NOT FOUND, trying fallback")
    idx = content.rfind('("arthik_salahkar","makan maalik')
    print("Fallback idx:", idx)
    if idx >= 0:
        print(repr(content[idx:idx+200]))
