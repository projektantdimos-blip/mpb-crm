"""Локальный стенд моста для проверки v2: настоящие CRM-маршруты (bridge/app) на временной базе, без Telegram и почты.
Запуск:  python v2/dev/crm_dev_app.py        (нужны пакеты: fastapi, uvicorn, pywebpush)
Демо-вход: сотрудники Алексей / Дмитрий / Максим / Игорь — PIN 1111, руководитель «Руководитель» — PIN 1234.
Только для разработки — в продакшен не загружать."""
import asyncio
import os
import sys
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / ".data"
DATA.mkdir(exist_ok=True)
os.environ["DATA_DIR"] = str(DATA)
os.environ["BRIDGE_KEY"] = "demo-key-demo-key-demo-key"
os.environ["CRM_ADMIN_NAME"] = "Руководитель"
os.environ["CRM_ADMIN_PIN"] = "1234"
sys.path.insert(0, str(HERE.parents[1] / "bridge"))

import uvicorn                                           # noqa: E402
from fastapi import Depends, FastAPI, HTTPException      # noqa: E402
from fastapi.middleware.cors import CORSMiddleware      # noqa: E402

from datetime import date, timedelta                                   # noqa: E402

from app import appsscript, config, crm_auth, crm_auto, crm_auto_routes, crm_db, crm_clients, crm_kp, crm_mail, crm_routes, crm_sched, crm_to, crm_stage_routes, crm_stages as st, db, tg_bot   # noqa: E402


# --- поддельные таблица Google и Telegram: общие для приложения (через /dev/sheet) и для моста ---
_SHEET_WHO = dict(st.STAGES)               # настоящая таблица считает «ответственного» по своему фиксированному списку

def _iso(n):
    return (date.today() + timedelta(days=n)).isoformat()


def _task(row, c, a, k, wt, stage, dl, due, mgr="Алексей"):
    return {"row": row, "customer": c, "address": a, "contractNo": k, "workType": wt, "startDate": _iso(-60), "dueDate": _iso(due), "stage": stage, "deadline": _iso(dl),
            "comment": "", "siteContact": "Контактное лицо", "siteContactPhone": "+7 900 000-00-00", "manager": mgr, "closed": False, "responsible": _SHEET_WHO.get(stage, "")}


def _lead(row, c, contact, ph, funnel, obj, amount, status, last, owner):
    return {"row": row, "date": _iso(-20), "customer": c, "contact": contact, "phoneEmail": ph, "funnel": funnel, "object": obj, "essence": "", "amount": amount, "status": status, "lastContact": _iso(last), "owner": owner, "comment": ""}


SHEET = {"tasks": {}, "leads": {}}
for _t in [_task(2, "ТЦ «Меридиан»", "пр. Энергетиков, 14", "118/26", "Монтаж", "Запустить монтаж", 3, 50), _task(3, "Школа № 214", "ул. Лесная, 7", "121/26", "Монтаж", "Расчет", -1, 70),
           _task(4, "ООО «Северный парк»", "Парковая ул., 2", "124/26", "Проектирование", "Проектирование", 5, 40), _task(5, "БЦ «Атлант»", "Невский пр., 88", "109/26", "Монтаж", "Печать документов", 1, 16),
           _task(6, "Склад «ЛогистПро»", "Шушары, Московское ш., 3", "127/26", "Испытания", "Обследовать", 7, 22), _task(10, "Школа №214", "ул. Лесная, 7", "130/26", "Испытания", "Обследовать", 6, 30), _task(9, "АЗС «Север-Нефть»", "Выборгское ш., 120", "115/26", "Монтаж", "Закупка оборудования", 4, 57)]:
    SHEET["tasks"][_t["row"]] = _t
for _l in [_lead(2, "ТЦ «Меридиан»", "Сергей Петров", "+7 911 204-18-33", "Сайт", "Монтаж АПС, 3 этажа", 1240000, "Согласование условий", -1, "Алексей"),
           _lead(3, "ООО «Северный парк»", "Андрей Лукин", "+7 905 118-60-09", "Сарафан", "Проект противопожарной защиты", 380000, "Переговоры", -6, "Дмитрий"),
           _lead(4, "Склад «ЛогистПро»", "Павел Ермаков", "+7 911 903-44-70", "Алексей", "Испытания ВПВ", 215000, "КП отправлено", -2, "Алексей"),
           _lead(8, "Склад Логист Про", "Павел Ермаков", "+7 911 903-44-70", "Сайт", "Монтаж АПС", 540000, "Переговоры", -9, "Дмитрий"),_lead(9, "Школа №214", "Ольга Ветрова", "o.vetrova@school214.example", "Сарафан", "Проверка ВПВ", 90000, "Новое обращение", -2, "Алексей"),_lead(7, "АЗС «Север-Нефть»", "Денис Руднев", "+7 911 800-90-31", "Сарафан", "Монтаж пожаротушения", 1939000, "Переговоры", -3, "Алексей")]:
    SHEET["leads"][_l["row"]] = _l


config.TO_BRIDGE_PIN = "0000"
_m = date.today().month
TO_DATA = {"objects": [
    {"id": 1, "name": "ТЦ «Меридиан»", "address": "пр. Энергетиков, 14", "spec": "Дмитрий", "period": "Квартал", "first": (_m - 1) % 3 + 1, "years": {str(date.today().year): {"to": {}, "deadline": "", "reason": ""}}},
    {"id": 2, "name": "Школа № 214", "address": "ул. Лесная, 7", "spec": "Алексей", "period": "Месяц", "first": 1, "years": {str(date.today().year): {"to": {str(_m): "no"}, "deadline": _iso(4), "reason": "Нет доступа в здание"}}},
    {"id": 3, "name": "АЗС «Север-Нефть»", "address": "Выборгское ш., 120", "spec": "Дмитрий", "period": "Месяц", "first": 1, "years": {str(date.today().year): {"to": {str(_m): "yes"}, "deadline": "", "reason": ""}}},
]}


CLIENTS_META = {}
EXPORTS = {}                        # копия CRM в «таблицу» (api_exportSave) — смотреть: GET /dev/export
_TO_SALT = "dev-salt"
_toh = lambda p: __import__("hashlib").sha256((_TO_SALT + ":" + p).encode()).hexdigest()
TO_AUTH = {"salt": _TO_SALT, "admin": _toh("0000"), "users": {"Дмитрий": {"role": "spec", "h": _toh("1111")}, "__acc": {"role": "acc", "h": _toh("2222")}}}


def fake_sheet(fn, args):
    t, l = SHEET["tasks"], SHEET["leads"]
    if fn == "to_load":
        return TO_DATA
    if fn == "to_exportAuth":            # PIN ТО на стенде: 0000 — руководитель, 1111 — Дмитрий, 2222 — бухгалтер
        return TO_AUTH
    if fn == "api_exportSave":
        EXPORTS[args[0]] = args[1]
        return {"ok": True, "rows": len(args[1]) - 1}
    if fn == "api_clientsList":
        return [{"key": k, "name": v[0], "inn": v[1], "note": ""} for k, v in CLIENTS_META.items()]
    if fn == "api_clientsSave":
        if args[2]:
            CLIENTS_META[args[0]] = (args[1], args[2])
        else:
            CLIENTS_META.pop(args[0], None)
        return {"ok": True}
    if fn == "api_listTasks":
        return [dict(x) for x in t.values()]
    if fn == "api_getTask":
        return dict(t[args[0]])
    if fn == "api_saveTask":
        t[args[0]].update(args[1])
        t[args[0]]["responsible"] = _SHEET_WHO.get(t[args[0]]["stage"], "")
        return True
    if fn == "api_createTask":
        row = max(t) + 1
        t[row] = {"row": row, **args[0], "responsible": _SHEET_WHO.get(args[0]["stage"], "")}
        return {"row": row}
    if fn == "api_deleteTask":
        t.pop(args[0], None)
        return True
    if fn == "api_kpregList":
        return [dict(x) for x in l.values()]
    if fn == "api_kpregSave":
        l[args[0]].update(args[1])
        return True
    if fn == "api_kpregCreate":
        row = max(l) + 1
        l[row] = {"row": row, **args[0]}
        return {"row": row}
    if fn == "api_kpregDelete":
        l.pop(args[0], None)
        return True
    return True


TG_LOG = []


def fake_tg(method, payload):
    TG_LOG.append({"method": method, **payload})
    return {"ok": True}


def seed():
    db.init()
    crm_db.init()
    if not crm_db.kv_get(st.KV_KEY):                       # для показа: второй набор этапов — для испытаний
        _p, _d = st.validate([{'id': 'std', 'name': 'Стандартный', 'keys': ['монтаж', 'проект'], 'stages': [{'name': n, 'who': w, 'days': 3} for n, w in st.STAGES]},
                              {'id': 'test', 'name': 'Испытания', 'keys': ['испыт', 'рр'], 'stages': [{'name': 'Договор Подписать', 'who': 'Алексей', 'days': 2}, {'name': 'Обследовать', 'who': 'Алексей', 'days': 3},
                               {'name': 'Провести испытания', 'who': 'Дмитрий', 'days': 5}, {'name': 'Оформить протокол', 'who': 'Дмитрий', 'days': 3}, {'name': 'Сдача работ', 'who': 'Алексей', 'days': 2}, {'name': 'Работа сдана', 'who': 'Игорь', 'days': 0}]}], 'std')
        st.save(_p, _d, 'dev')
    crm_auth.bootstrap_admin()
    crm_auto.seed_rules()
    appsscript._post = fake_sheet
    tg_bot._http = fake_tg
    config.TG_BOT_ENABLED = True
    for n in ("Алексей", "Дмитрий", "Максим", "Игорь"):
        if not crm_db.user_by_name(n):
            crm_auth.create_user(n, "1111")
    for n, chat in (("Руководитель", 1000), ("Алексей", 1001), ("Дмитрий", 1002)):
        u = crm_db.user_by_name(n)
        if u and not u["tg_chat"]:
            crm_db.user_set_tg(u["id"], chat)
    now = time.time()
    if not db.list_threads():
        for ch, peer, title, text, ago in [("tg", "1", "Сергей Петров", "Хорошо, ждём вас в понедельник", 600), ("mail", "info@school.demo", "Ирина Власова", "Re: Акт обследования — подписан", 7200),
                                           ("max", "3", "Павел Ермаков", "Счёт на испытания получили", 14400), ("tg", "4", "Денис Руднев", "Фото с объекта отправил", 100000)]:
            db.add_message(ch, peer, title, f"seed-{peer}", "in", title, "", text, now - ago)
    if not crm_db.msgs_list("general"):
        a, d, m = (crm_db.user_by_name(n)["id"] for n in ("Алексей", "Дмитрий", "Максим"))
        crm_db.msg_add("general", a, "Коллеги, в понедельник планёрка в 10:00", False)
        crm_db.msg_add("general", d, "Принято, подготовлю отчёт по закупкам", False)
        crm_db.msg_add("buy", d, "Заказал извещатели ИП 212 — 150 шт., отгрузка во вторник", False)
        crm_db.msg_add("calc", a, "Нужен расчёт по БЦ «Атлант», 3 этажа, около 240 извещателей", False)
        crm_db.msg_add("general", m, "Пожарная инспекция едет на Школу № 214 завтра в 11:00 — нужны журналы!", True)


@asynccontextmanager
async def lifespan(app):
    seed()
    task = asyncio.create_task(crm_sched.run_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["X-Api-Key", "X-Session", "Content-Type"])
app.include_router(crm_routes.router)
app.include_router(crm_auto_routes.router)
app.include_router(crm_stage_routes.router)
app.include_router(crm_kp.router)
app.include_router(crm_mail.router)
app.include_router(crm_clients.router)
app.include_router(crm_to.router)


from fastapi import Request                                # noqa: E402


@app.post("/dev/sheet")
async def dev_sheet(request: Request):
    """Эмулирует Apps Script для приложения: тот же ответ {ok, data}, что и у /exec."""
    body = await request.json()
    try:
        return {"ok": True, "data": fake_sheet(body.get("fn"), body.get("args") or [])}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/dev/export")
def dev_export():
    return EXPORTS


@app.get("/dev/tg")
def dev_tg():
    return TG_LOG


@app.post("/dev/tg/clear")
def dev_tg_clear():
    TG_LOG.clear()
    return {"ok": True}


@app.post("/dev/tg/press")
async def dev_tg_press(request: Request):
    """Нажатие кнопки в «Telegram»: {chat, data, text}."""
    b = await request.json()
    res = tg_bot.handle_update({"callback_query": {"id": "dev", "data": b["data"], "message": {"chat": {"id": b["chat"]}, "message_id": 1, "text": b.get("text", "")}}})
    return res


# --- минимальные маршруты «Общения» (читает те же таблицы, что боевой мост) ---
@app.get("/api/threads", dependencies=[Depends(crm_auth.api_key)])
def threads():
    return db.list_threads()


@app.get("/api/threads/{tid}/messages", dependencies=[Depends(crm_auth.api_key)])
def messages(tid: str):
    if not db.get_thread(tid):
        raise HTTPException(404, "Переписка не найдена")
    return db.list_messages(tid)


@app.post("/api/threads/{tid}/read", dependencies=[Depends(crm_auth.api_key)])
def mark_read(tid: str):
    db.set_unread(tid, 0)
    return {"ok": True}


@app.get("/api/threads/{tid}/avatar", dependencies=[Depends(crm_auth.api_key)])
def avatar(tid: str):
    raise HTTPException(404, "Фото нет")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8790, log_level="warning")
