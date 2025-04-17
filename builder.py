import os
import shutil
import subprocess

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(PROJECT_ROOT, "web")
DIST_DIR = os.path.join(WEB_DIR, "dist")
DOCS_DIR = os.path.join(PROJECT_ROOT, "docs")

def run_npm_build():
    print("🚧 Running npm build...")
    result = subprocess.run(["npm", "run", "build"], cwd=WEB_DIR, shell=True)
    if result.returncode != 0:
        raise RuntimeError("❌ npm build failed!")

def move_dist_to_docs():
    if os.path.exists(DOCS_DIR):
        print("🗑 Removing old 'docs' directory...")
        shutil.rmtree(DOCS_DIR)
    print("🚚 Moving 'dist' → 'docs'...")
    shutil.move(DIST_DIR, DOCS_DIR)

if __name__ == "__main__":
    try:
        run_npm_build()
        move_dist_to_docs()
        print("✅ Done! The new site is ready in 'docs/'")
    except Exception as e:
        print(str(e))
