"""Downloads the AI models make3d needs, once, so it can run offline after.

    python fetch_models.py hunyuan,hunyuan-mv 1     (1 = include the texture models)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backends  # noqa: E402


def main():
    names = [n.strip() for n in sys.argv[1].split(',') if n.strip()]
    texture = len(sys.argv) < 3 or sys.argv[2] != '0'
    from huggingface_hub import snapshot_download
    wanted = []
    for i, name in enumerate(names):
        if name not in backends.Hunyuan.VARIANTS:
            print(f'  unknown model "{name}"; choose from {", ".join(backends.Hunyuan.VARIANTS)}')
            return 1
        # The texture models are shared: fetch them with the first model only.
        for item in backends.Hunyuan.downloads(name, texture=texture and i == 0):
            if item not in wanted:
                wanted.append(item)
    for repo, patterns in wanted:
        print(f'  {repo} {", ".join(patterns)}', flush=True)
        snapshot_download(repo, allow_patterns=patterns)
    # The background remover's model (u2net) downloads on first use; do it now.
    print('  background remover model', flush=True)
    from rembg import new_session
    new_session('u2net')
    print('  all models downloaded')
    return 0


if __name__ == '__main__':
    sys.exit(main())
