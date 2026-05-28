import os
import sys

# Add api directory to path so we can import db_client
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db_client import db

def main():
    print("--- DB Mode ---")
    print(f"Mode: {db.mode}")
    
    print("\n--- Company Branding ---")
    branding = db.get_branding()
    for k, v in branding.items():
        if k == "logo_data" and v:
            print(f"{k}: <base64 data, length {len(v)}>")
        else:
            print(f"{k}: {v}")
            
    print("\n--- All Settings ---")
    settings = db.get_settings()
    for k, v in settings.items():
        print(f"{k}: {v}")

if __name__ == "__main__":
    main()
