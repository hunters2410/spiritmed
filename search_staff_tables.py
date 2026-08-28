import glob, re, os

files = glob.glob(r'c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\*.sql')
for f in files:
    with open(f, 'r', encoding='utf-8', errors='replace') as fp:
        content = fp.read()
    tables = re.findall(r'CREATE TABLE `([^`]+)`', content)
    for t in set(tables):
        if any(k in t.lower() for k in ['staff', 'user', 'emp', 'person', 'doctor', 'nurse']):
            print(f"{os.path.basename(f)}: Table `{t}`")

            # Print first 5 rows if INSERT INTO exists
            inserts = [m.start() for m in re.finditer(rf'INSERT INTO `{t}`', content, re.IGNORECASE)]
            if inserts:
                print(f"  Found INSERT INTO `{t}` ({len(inserts)} blocks)")
