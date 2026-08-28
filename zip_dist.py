import os
import zipfile

dist_folder = "dist"
zip_filename = "dist.zip"

print(f"Zipping {dist_folder} into {zip_filename}...")

with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(dist_folder):
        for file in files:
            file_path = os.path.join(root, file)
            # Arcname relative to dist folder so Hostinger unzips directly
            arcname = os.path.relpath(file_path, start=dist_folder)
            zipf.write(file_path, arcname)

size_mb = os.path.getsize(zip_filename) / (1024 * 1024)
print(f"Successfully created {zip_filename} ({size_mb:.2f} MB)")
