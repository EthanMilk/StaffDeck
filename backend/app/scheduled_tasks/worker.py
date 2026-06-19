from __future__ import annotations

import argparse
import signal
from time import sleep

from sqlmodel import Session

from app.db import engine, init_db
from app.db.seed import seed_demo_data
from app.scheduled_tasks.service import WORKER_SLEEP_SECONDS, due_scheduled_tasks, execute_scheduled_task


_stopped = False


def _handle_stop(_signum: int, _frame: object) -> None:
    global _stopped
    _stopped = True


def run_worker(*, once: bool = False, poll_seconds: float = WORKER_SLEEP_SECONDS) -> None:
    init_db()
    with Session(engine) as db:
        seed_demo_data(db)
    while not _stopped:
        with Session(engine) as db:
            due = due_scheduled_tasks(db)
            for task in due:
                execute_scheduled_task(db, task)
        if once:
            return
        sleep(max(1.0, poll_seconds))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run UltraRAG4 scheduled task worker")
    parser.add_argument("--once", action="store_true", help="scan and execute due tasks once, then exit")
    parser.add_argument("--poll-seconds", type=float, default=WORKER_SLEEP_SECONDS)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)
    run_worker(once=args.once, poll_seconds=args.poll_seconds)


if __name__ == "__main__":
    main()
