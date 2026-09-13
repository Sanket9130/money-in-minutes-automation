#!/usr/bin/env python3
import argparse
import os
import shutil
import subprocess
import sys

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--driving", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    # Explicitly refuse to claim LivePortrait inference until the real
    # LivePortrait installation is configured.
    liveportrait_cmd = os.environ.get("LIVEPORTRAIT_COMMAND")

    if not liveportrait_cmd:
        print(
            "LIVEPORTRAIT_COMMAND is not configured; refusing to fake "
            "LivePortrait provenance.",
            file=sys.stderr,
        )
        return 2

    command = liveportrait_cmd.format(
        source=args.source,
        driving=args.driving,
        output=args.output,
    )

    result = subprocess.run(command, shell=True)
    if result.returncode != 0:
        return result.returncode

    if not os.path.isfile(args.output) or os.path.getsize(args.output) == 0:
        print("LivePortrait command completed without producing output.", file=sys.stderr)
        return 3

    print(f"LivePortrait output: {args.output}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
