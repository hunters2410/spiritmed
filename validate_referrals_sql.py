import re

def validate():
    with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step2_referrals.sql", "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    print(f"Total lines: {len(lines)}")
    
    # We want to check lines 3 to len(lines)-2
    for idx in range(2, len(lines) - 2):
        line = lines[idx].strip()
        if not line:
            continue
            
        # Count number of unescaped single quotes
        # Note: in our SQL, single quotes are escaped as ''
        # We can find all matches of ' (not preceded or followed by another ')
        # But a simple way is to check if the line compiles or has an even number of single quotes
        # (excluding comments or other stuff)
        
        # Let's count total single quotes in the line
        quote_count = line.count("'")
        
        # In our format, each row is like:
        # ('uuid', 'uuid', 'full_name', 'name', contact, email, affiliation, true),
        # If contact/email/affiliation are null, they are NULL (no quotes).
        # So we have:
        # - uuid (2 quotes)
        # - branch_id (2 quotes)
        # - full_name (at least 2 quotes, more if it has escaped quotes like '' inside)
        # - name (at least 2 quotes)
        # - contact (0 quotes if NULL, 2 quotes if string)
        # - email (0 quotes if NULL, 2 quotes if string)
        # - affiliation (0 quotes if NULL, 2 quotes if string)
        # In all cases, the number of single quotes should be EVEN!
        # Because every quoted string has a starting and ending quote, and any escaped quote inside is '' (which is 2 quotes).
        # So the total number of single quotes MUST be even.
        if quote_count % 2 != 0:
            print(f"Odd quote count at Line {idx+1}: {quote_count} quotes. Line content: {repr(line)}")

if __name__ == '__main__':
    validate()
