"""UI fixtures live only in intercepted browser responses; no database writes or provider calls."""
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
NOW = datetime.fromisoformat(subprocess.check_output(['node', '--input-type=module', '-e', "import { DateTime } from 'luxon'; console.log(DateTime.now().setZone('Europe/Kyiv').toISO())"], cwd=ROOT, text=True).strip())
STAMP = NOW.isoformat()
TOMORROW = (NOW + timedelta(days=1)).replace(hour=9, minute=0, second=0)
SETTINGS = dict(paused=True, model='deepseek-chat', timezone='Europe/Kyiv', keywords=['репетитор', 'навчання'], profiles=['example_school'], knowledge='Mimiao — простір для викладачів і шкіл.', voice='Живий, простий, уважний голос.', forbidden=['Не вигадувати досвід'], preferred=['Питання з життя'], dailyCount=5, adaptive=False, startedAt=STAMP, researchEnabled=True)
POSTS = []
for i, text in enumerate([
    'Учень каже: «Я нічого не запам’ятав». А потім пояснює тему однокласнику краще за підручник.\n\nЯкі маленькі перемоги на заняттях ви помічаєте першими?',
    'Підготовка до уроку: 40 хвилин. Пошук того самого файлу: ще 20.\n\nУ вас теж є папка «фінальна_точно_остання»?',
    'Що допомагає повернути увагу групи після довгого дня? Збираємо маленькі викладацькі ритуали.',
    'Найкраща ідея тижня прийшла не за ноутбуком, а під час прогулянки. Де ви знаходите свої?'
]):
    POSTS.append(dict(id=f'fixture-{i}', text=text, alternative='', category=['teaching','life','teaching','founder'][i], status='scheduled', scheduled_at=(TOMORROW+timedelta(hours=i*3)).isoformat(), published_at=None, created_at=STAMP, updated_at=STAMP, revision=1, media_ids=['photo-1','photo-2'] if i == 0 else [], sources=[], topic=['Маленькі перемоги','Життя викладача','Увага на заняттях','Ідеї поза роботою'][i], reason='Вопрос для обмена реальным опытом.', error=None, provider_id=None, permalink=None, expires_at=None, generated=True, root_id=None, experiment_arm=None))
PUBLISHED = [{**p, 'status': 'published', 'published_at': (NOW-timedelta(days=i+1)).isoformat(), 'media_ids': []} for i,p in enumerate(POSTS)]
ANALYTICS = dict(
    account=[dict(day=(NOW-timedelta(days=i)).date().isoformat(), followers=350-i*3+(i%3), profile_views=84+i, measured_at=STAMP) for i in range(14)],
    posts=PUBLISHED,
    metrics=[dict(id=f'm-{i}', post_id=p['id'], checkpoint='24h', source='api', measured_at=STAMP, age_hours=24, views=2400-i*480, replies=18-i*3, likes=95-i*8, reposts=3, quotes=0, shares=2, follows=None, profile_visits=None) for i,p in enumerate(PUBLISHED)],
    groups=[dict(category='teaching',count=12,median_views=1480,average_replies=11.5)], reports=[], experiments=[])
DATA = {
    '/auth/session': dict(authenticated=True, csrf='browser-fixture'),
    '/settings': SETTINGS,
    '/integrations': dict(threads=None, deepseek=False, metaConfigured=False, livePublishing=False, publicUrl='http://127.0.0.1:5179', redirectUri='https://example.com/callback'),
    '/posts': POSTS,
    '/media': [dict(id=f'photo-{i}',filename=f'test-{i}.jpg',width=800,height=800,bytes=1000,alt=f'Тестовое фото {i}',created_at=STAMP) for i in [1,2]],
    '/analytics': ANALYTICS,
    '/trends': [dict(id='trend-1',title='Маленькие победы на занятиях',summary='Преподаватели обсуждают, как замечать прогресс, который не виден в оценках.',angle='Попросить поделиться моментом, когда ученик удивил преподавателя.',evidence=[dict(url='https://example.com/source',text='Изолированный пример для проверки интерфейса.',author='Тестовый источник',publishedAt=STAMP,discoveredAt=STAMP,provider='fixture')],score=84,confidence='medium',state='new',expires_at=TOMORROW.isoformat(),created_at=STAMP)],
    '/ideas': [dict(id='idea-1',text='Розповісти про маленькі ритуали перед першим заняттям з новою групою.',source_url=None,kind='manual',state='saved',note='Личная история, без рекламы',created_at=STAMP,updated_at=STAMP)],
    '/replies': [dict(id='reply-1',post_id='fixture-0',provider_id='fixture',username='example_teacher',text='Для мене найбільша перемога — коли учень перестає боятися помилок.',draft='Так, безпечний простір змінює все. Що допомагає його створити?',state='new',classification='experience',meaningful=True,manual=False,source_url=None,created_at=STAMP,sent_id=None,kind='incoming')],
    '/operations': dict(heartbeats=[dict(name='worker',at=STAMP)],usage=[dict(kind='generation',model='deepseek-chat',requests=6,input_tokens=8200,output_tokens=2400,cached_tokens=1100)],plans=[],events=[dict(id='event-1',kind='research',status='error',message='Тестовое состояние: источник временно недоступен. Повторите позже.',details={},created_at=STAMP)])
}
NAV = [('today','Рабочий стол','У каждого поста есть завтра.'),('calendar','Контент-план','Контент-план'),('trends','Что обсуждают','Что обсуждают сейчас'),('ideas','Банк идей','Идеи не должны теряться.'),('analytics','Результаты','Что приносит результат'),('discussions','Обсуждения','Ответить по-человечески'),('voice','Голос и знания','Звучать как Mimiao'),('connections','Подключения','Всё под наблюдением')]

def settled(page):
    page.wait_for_load_state('networkidle')
    page.wait_for_function("[...document.getAnimations()].filter(a => a.effect?.getTiming().iterations !== Infinity).every(a => a.playState !== 'running')")

def mock_page(browser, width=1440, reduced='no-preference'):
    page = browser.new_page(viewport={'width':width,'height':1000 if width>700 else 844}, reduced_motion=reduced)
    failures, writes = [], []
    page.on('pageerror', lambda e: failures.append(str(e)))
    state = {'error': False, 'empty': False, 'login': False, 'hold': False}
    def route_api(route):
        path = route.request.url.split('/api',1)[1].split('?',1)[0]
        if route.request.method != 'GET':
            writes.append(path)
            route.fulfill(status=500,json={'message':'Unexpected write during visual test'})
            return
        if path=='/posts' and state['hold']:
            return  # Intentionally pending until this page is closed.
        if path=='/posts' and state['error']:
            route.fulfill(status=503,json={'message':'Не удалось загрузить публикации. Повторите позже.'})
            return
        value = DATA.get(path, {'revisions':[],'attempts':[]} if path.endswith('/history') else [])
        if state['empty'] and isinstance(value,list): value=[]
        if path=='/auth/session' and state['login']: value={'authenticated':False}
        route.fulfill(status=200,json=value)
    page.route('**/api/**',route_api)
    page.route('**/media/*',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="'+('#ada18c' if r.request.url.endswith('1') else '#555e52')+'"/><circle cx="400" cy="360" r="210" fill="#e9d9be"/><path d="M100 800L500 260L800 800" fill="#887055"/></svg>'))
    return page,state,failures,writes

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page,state,errors,writes = mock_page(browser)
    for width in [390,768,1440,1920]:
        page.set_viewport_size({'width':width,'height':1000 if width>700 else 844})
        for key,label,heading in NAV:
            page.goto(f'http://127.0.0.1:5179/?page={key}')
            expect(page.get_by_role('heading',name=heading,exact=True)).to_be_visible()
            settled(page)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow {width} / {key}'
            if width in [390,1440] and key in ['today','analytics','connections','trends']:
                page.screenshot(path=str(OUT/f'design-{key}-{width}.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':1000})
    page.goto('http://127.0.0.1:5179/?page=analytics');settled(page)
    bar=page.get_by_role('group',name='Количество подписчиков по дням').get_by_role('button').first
    bar.focus()
    assert '·' in page.locator('.chart-value').inner_text()
    page.goto('http://127.0.0.1:5179');settled(page)
    trigger=page.locator('.post-row').first;trigger.click();settled(page)
    dialog=page.get_by_role('dialog');expect(dialog).to_be_visible()
    assert page.evaluate("document.getElementById('root').inert")
    page.get_by_role('textbox',name='Текст поста',exact=True).fill('Перевірка живого перегляду — без публікації.')
    expect(page.locator('.preview-content>p')).to_have_text('Перевірка живого перегляду — без публікації.')
    page.get_by_label('Фото вперёд',exact=True).first.click();settled(page)
    assert page.locator('.preview-photos img').first.get_attribute('src').endswith('photo-2')
    page.screenshot(path=str(OUT/'design-editor-1440.png'),full_page=True)
    close=page.get_by_role('button',name='Закрыть редактор');close.focus();page.keyboard.press('Shift+Tab')
    expect(page.get_by_role('button',name='В очередь')).to_be_focused()
    page.keyboard.press('Tab');expect(close).to_be_focused()
    page.keyboard.press('Escape');expect(dialog).to_have_count(0);expect(trigger).to_be_focused()
    assert not page.evaluate("document.getElementById('root').inert")
    page.get_by_role('button',name='Спокойные эффекты',exact=True).click();expect(page.locator('html')).to_have_attribute('data-motion','calm')
    page.reload();settled(page);expect(page.locator('html')).to_have_attribute('data-motion','calm')
    page.get_by_role('button',name='Спокойные эффекты',exact=True).click();expect(page.locator('html')).to_have_attribute('data-motion','full')
    page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Новый пост',exact=True).click();settled(page)
    page.get_by_role('textbox',name='Текст поста',exact=True).fill('Мобільний перегляд.');page.get_by_role('button',name='Предпросмотр поста',exact=True).click()
    expect(page.locator('.post-preview')).to_be_visible();expect(page.locator('.drawer-body')).to_be_hidden()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT/'design-editor-390.png'),full_page=True)
    page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_role('button',name='Меню',exact=True).click();page.keyboard.press('Escape');expect(page.get_by_role('button',name='Меню',exact=True)).to_be_focused()
    state['error']=True;page.goto('http://127.0.0.1:5179');expect(page.get_by_role('alert')).to_contain_text('Не удалось');assert page.locator('.schedule-hero').count()==0
    state['error']=False;state['empty']=True;page.goto('http://127.0.0.1:5179');expect(page.get_by_role('heading',name='Здесь начинается следующий день')).to_be_visible()
    state['login']=True;page.goto('http://127.0.0.1:5179');expect(page.get_by_role('heading',name='С возвращением')).to_be_visible();settled(page);page.screenshot(path=str(OUT/'design-login-390.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':1000});page.screenshot(path=str(OUT/'design-login-1440.png'),full_page=True)
    assert not errors,errors
    assert not writes,writes
    page.close()
    reduced,state,errors,writes=mock_page(browser,reduced='reduce');reduced.goto('http://127.0.0.1:5179');settled(reduced)
    expect(reduced.locator('html')).to_have_attribute('data-motion','calm')
    assert reduced.evaluate("getComputedStyle(document.querySelector('.ambient-glow')).animationName === 'none'")
    reduced.close()
    loading,state,errors,writes=mock_page(browser);state['hold']=True;loading.goto('http://127.0.0.1:5179',wait_until='domcontentloaded');expect(loading.get_by_role('status')).to_be_visible();expect(loading.locator('.skeleton').first).to_be_visible();loading.close()
    browser.close()
    print('PASS: 8 populated screens at 390/768/1440/1920; editor preview, photo ordering, focus trap/restore, Escape, mobile navigation, persisted/OS reduced motion, loading/empty/error, screenshots. No writes.')
