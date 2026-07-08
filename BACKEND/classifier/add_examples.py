"""One-shot script to append Devanagari legal examples to train.py"""
import os

path = os.path.join(os.path.dirname(__file__), 'train.py')

NEW_EXAMPLES = """
# DEVANAGARI LEGAL FIX - improve Devanagari routing for legal queries
("vidhi_sahayak","FIR darz nahi hui police ne nahi likhi report"),
("vidhi_sahayak","police FIR refuse kar rahi hai teen baar gaya"),
("vidhi_sahayak","pakad liya police ne bina wajah bail chahiye"),
("vidhi_sahayak","zameen jhagda hai court mein jaana hai"),
("vidhi_sahayak","ghar mein maar peet ho rahi hai vakeel chahiye"),
("vidhi_sahayak","illegal kabza kar liya meri property pe court case"),
("vidhi_sahayak","online dhokha hua cyber FIR darz karni hai police"),
("vidhi_sahayak","police station ne case nahi liya advocate chahiye"),
("vidhi_sahayak","NALSA se free legal help chahiye court ke liye"),
("vidhi_sahayak","makan maalik ne illegally nikaala legal notice"),
"""

content = open(path, encoding='utf-8').read()
target = '("arthik_salahkar","ration card number se kisan yojana ka bank verification fail"),\n]'
replacement = '("arthik_salahkar","ration card number se kisan yojana ka bank verification fail"),' + NEW_EXAMPLES + ']'

if target in content:
    content2 = content.replace(target, replacement, 1)
    open(path, 'w', encoding='utf-8').write(content2)
    print(f"Done. Total chars: {len(content2)}")
else:
    print("TARGET NOT FOUND")
    # Show what the end looks like
    idx = content.rfind('"arthik_salahkar","ration card')
    if idx >= 0:
        print("Context:", repr(content[idx:idx+200]))
