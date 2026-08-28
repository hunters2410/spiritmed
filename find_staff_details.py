import glob, re

files = [
    r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\u819957882_urocaresystem (18).sql",
    r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\u819957882_urocaresystem (16).sql",
    r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payslip.sql"
]

for f in files:
    with open(f, 'r', encoding='utf-8', errors='replace') as fp:
        content = fp.read()
    tables = re.findall(r'CREATE TABLE `([^`]+)`', content)
    print(f"=== {f} Tables ===")
    for t in sorted(set(tables)):
        if any(k in t.lower() for k in ['staff', 'user', 'emp', 'person', 'doctor', 'nurse', 'account', 'recept', 'payroll']):
            print(f"  {t}")
            # check lines of INSERT INTO
            inserts = [m.start() for m in re.finditer(rf'INSERT INTO `{t}`', content, re.IGNORECASE)]
            if inserts:
                block = content[inserts[0]:inserts[0]+500]
                print(f"    Sample insert: {block[:200]}...")

