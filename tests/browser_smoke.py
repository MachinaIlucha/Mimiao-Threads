from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
password = (ROOT / 'OWNER-LOGIN.local.txt').read_text().splitlines()[0].split(': ', 1)[1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:5179')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='С возвращением')).to_be_visible()
    page.get_by_label('Пароль владельца').fill(password)
    page.get_by_role('button', name='Открыть студию').click()
    expect(page.get_by_role('heading', name='У каждого поста есть завтра.')).to_be_visible()
    (ROOT / 'test-results').mkdir(exist_ok=True)
    page.wait_for_function("[...document.getAnimations()].filter(a => a.effect?.getTiming().iterations !== Infinity).every(a => a.playState !== 'running')")
    page.screenshot(path=str(ROOT / 'test-results/dashboard.png'), full_page=True)
    for label, heading in [('Контент-план','Контент-план'),('Что обсуждают','Что обсуждают сейчас'),('Банк идей','Идеи не должны теряться.'),('Результаты','Что приносит результат'),('Обсуждения','Ответить по-человечески'),('Голос и знания','Звучать как Mimiao'),('Подключения','Всё под наблюдением')]:
        page.get_by_role('navigation').get_by_role('button', name=label).click()
        expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
    page.get_by_role('navigation').get_by_role('button', name='Рабочий стол').click()
    page.get_by_role('button', name='Новый пост').click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.get_by_label('Текст поста').fill('Як ви знаходите баланс між підготовкою до уроків і часом для себе?')
    page.get_by_label('Тема', exact=True).fill('Проверка интерфейса — не публиковать')
    page.wait_for_function("[...document.getAnimations()].filter(a => a.effect?.getTiming().iterations !== Infinity).every(a => a.playState !== 'running')")
    page.screenshot(path=str(ROOT / 'test-results/editor.png'), full_page=True)
    page.get_by_role('button', name='Закрыть редактор').click()
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_function("document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
    page.wait_for_function("[...document.getAnimations()].filter(a => a.effect?.getTiming().iterations !== Infinity).every(a => a.playState !== 'running')")
    page.screenshot(path=str(ROOT / 'test-results/mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
    page.get_by_role('button', name='Меню', exact=True).click()
    page.get_by_role('navigation').get_by_role('button', name='Подключения').click()
    expect(page.get_by_role('heading',name='Всё под наблюдением')).to_be_visible()
    assert not errors, errors
    browser.close()
    print('PASS: login, 8 screens, editor, mobile layout; no browser errors. No posts saved or sent.')
