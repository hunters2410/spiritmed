def check():
    with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step2_referrals.sql", "r", encoding="utf-8") as f:
        content = f.read()

    print(f"Total characters: {len(content)}")
    
    in_quote = False
    quote_start_idx = -1
    line_num = 1
    col_num = 1
    
    # We want to trace single quotes. Escape character in standard SQL is '' (two single quotes).
    i = 0
    while i < len(content):
        c = content[i]
        
        if c == '\n':
            line_num += 1
            col_num = 1
            i += 1
            continue
            
        if c == "'":
            # Check if it's an escaped single quote ''
            if in_quote and i + 1 < len(content) and content[i+1] == "'":
                # Escaped quote
                i += 2
                col_num += 2
                continue
            else:
                in_quote = not in_quote
                if in_quote:
                    quote_start_idx = i
                    start_line = line_num
                    start_col = col_num
                else:
                    quote_start_idx = -1
        
        col_num += 1
        i += 1
        
    if in_quote:
        # Find lines around the quote start
        print(f"Unclosed quote starting at line {start_line}, column {start_col}")
        # Print snippet of content around it
        start_pos = max(0, quote_start_idx - 100)
        end_pos = min(len(content), quote_start_idx + 100)
        print("Context around start of unclosed quote:")
        print(repr(content[start_pos:end_pos]))
    else:
        print("Global check: All quotes are perfectly balanced!")

if __name__ == '__main__':
    check()
