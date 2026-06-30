#!/usr/bin/env python3
"""Porte de sortie dure. Bloque l'arret tant que la tache en cours n'est pas verifiee
(tests/types/lint verts). Armee uniquement si .claude/loop-active existe. Sinon : no-op.
Auto-detection JS/TS et Python. Garde anti-boucle via stop_hook_active."""
import json, os, shutil, subprocess, sys


def stdin_json():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


data = stdin_json()

# Anti-boucle : si deja en continuation forcee, on laisse s'arreter.
if data.get("stop_hook_active"):
    sys.exit(0)

cwd = data.get("cwd") or os.getcwd()
marker = os.path.join(cwd, ".claude", "loop-active")

# Porte desarmee -> zero friction (Q&A, sessions normales).
if not os.path.exists(marker):
    sys.exit(0)


def run(cmd):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except FileNotFoundError:
        return None, ""               # outil absent -> on saute
    except subprocess.TimeoutExpired:
        return 1, "timeout (>300s)"


checks = []

# --- JS / TS ---
pkg = os.path.join(cwd, "package.json")
if os.path.exists(pkg):
    try:
        with open(pkg) as f:
            scripts = json.load(f).get("scripts", {})
    except Exception:
        scripts = {}
    runner = "npm"
    if os.path.exists(os.path.join(cwd, "pnpm-lock.yaml")):
        runner = "pnpm"
    elif os.path.exists(os.path.join(cwd, "yarn.lock")):
        runner = "yarn"
    for s in ("typecheck", "lint", "test"):
        if s not in scripts:
            continue
        if s == "test" and "no test specified" in scripts[s]:
            continue                  # placeholder npm par defaut
        checks.append([runner, s] if runner == "yarn" else [runner, "run", s])

# --- Python ---
if any(os.path.exists(os.path.join(cwd, f))
       for f in ("pyproject.toml", "pytest.ini", "setup.cfg", "tox.ini")):
    if shutil.which("ruff"):
        checks.append(["ruff", "check", "."])
    if shutil.which("pytest"):
        checks.append(["pytest", "-q"])

# Rien de verifiable -> ne bloque pas.
if not checks:
    sys.exit(0)

for cmd in checks:
    code, out = run(cmd)
    if code is None:
        continue
    if cmd[:1] == ["pytest"] and code == 5:   # 5 = aucun test collecte -> pas un echec
        continue
    if code != 0:
        tail = out.strip()[-1200:]
        reason = (
            "Porte de sortie non franchie -- `" + " ".join(cmd) + "` echoue.\n"
            "Corrige la CAUSE dans le code (n'affaiblis/supprime JAMAIS un test pour passer), "
            "puis reboucle jusqu'au vert.\n\nSortie (fin):\n" + tail
        )
        print(json.dumps({"decision": "block", "reason": reason}))
        sys.exit(0)

# Tout vert -> desarme la porte et autorise l'arret.
try:
    os.remove(marker)
except OSError:
    pass
sys.exit(0)
