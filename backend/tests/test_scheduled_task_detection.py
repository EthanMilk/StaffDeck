from datetime import datetime

from app.scheduled_tasks.service import _fallback_draft, _looks_like_schedule_request


def test_tonight_half_hour_purchase_creates_once_draft() -> None:
    message = "今晚11点半帮我买一个A1"

    draft = _fallback_draft(message)

    assert _looks_like_schedule_request(message) is True
    assert draft is not None
    assert draft.schedule_type == "once"
    run_at = datetime.fromisoformat(str(draft.schedule["run_at"]))
    assert run_at.hour == 23
    assert run_at.minute == 30
    assert "买一个A1" in draft.prompt


def test_evening_colon_time_uses_pm_hour() -> None:
    draft = _fallback_draft("今晚11:45复盘差评")

    assert draft is not None
    assert draft.schedule_type == "once"
    run_at = datetime.fromisoformat(str(draft.schedule["run_at"]))
    assert run_at.hour == 23
    assert run_at.minute == 45
