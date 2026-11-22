import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = 'node_modules/.tmp/shots'
const URL = process.env.SBG_URL ?? 'http://127.0.0.1:5179/'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 })

const problems = []
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`[console] ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name, full = false) => {
  await wait(300)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  console.log('shot', name)
}
const check = (label, ok, extra = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`)

async function clickByText(selector, text) {
  const handles = await page.$$(selector)
  for (const handle of handles) {
    const content = await handle.evaluate((el) => el.textContent ?? '')
    if (content.includes(text)) {
      await handle.click()
      return true
    }
  }
  return false
}

const readState = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem('sbg.state.v1')
    if (!raw) return null
    const { state } = JSON.parse(raw)
    return { manual: state.manual ?? null, nodes: state.nodes, server: state.server }
  })

const readJson = () =>
  page.evaluate(() => document.querySelector('textarea[aria-label="config.json 内容"]')?.value ?? '')

const setJson = (next) =>
  page.evaluate((value) => {
    const ta = document.querySelector('textarea[aria-label="config.json 内容"]')
    if (!ta) return false
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    ).set
    setter.call(ta, value)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, next)

const editJson = async (mutate) => {
  const cfg = JSON.parse(await readJson())
  mutate(cfg)
  await setJson(JSON.stringify(cfg, null, 2))
  await wait(360)
  return cfg
}

const cardTitles = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="card-title"]')].map((el) =>
      (el.textContent ?? '').trim(),
    ),
  )

const tabNames = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((el) => (el.textContent ?? '').trim()),
  )

const openTab = async (name) => {
  const ok = await clickByText('[role="tab"]', name)
  await wait(320)
  return ok
}

const metrics = () =>
  page.evaluate(() => {
    const ta = document.querySelector('textarea[aria-label="config.json 内容"]')
    const pre = ta?.parentElement?.querySelector('pre')
    if (!ta || !pre) return null
    const pick = (el) => {
      const cs = getComputedStyle(el)
      return {
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontFamily: cs.fontFamily.slice(0, 40),
        padding: cs.padding,
        letterSpacing: cs.letterSpacing,
        wordBreak: cs.wordBreak,
        whiteSpace: cs.whiteSpace,
        scrollH: el.scrollHeight,
      }
    }
    return { pre: pick(pre), ta: pick(ta) }
  })

const linkUrls = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('p')]
      .map((el) => (el.textContent ?? '').trim())
      .filter((text) => text.includes('://')),
  )

// —— 0. 干净状态
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle0', timeout: 60000 })
await wait(300)
await shot('00-empty')

console.log('\n=== 卡片顺序 ===')
const baseTitles = await cardTitles()
console.log(JSON.stringify(baseTitles))
check('协议在服务器之前', baseTitles[0] === '协议' && baseTitles[1] === '服务器')
check('无节点时不显示证书卡', !baseTitles.some((t) => t.startsWith('证书')))
check('无节点时不显示证书页', !(await tabNames()).includes('证书'))

const addBySelect = async (label) => {
  await page.click('[aria-label="选择协议"]')
  await wait(280)
  const hit = await clickByText('[role="option"]', label)
  if (!hit) {
    problems.push(`[missing-option] ${label}`)
    await page.keyboard.press('Escape')
    return
  }
  await wait(220)
  await page.click('[aria-label^="添加 "]')
  await wait(300)
}

await page.click('input[placeholder*="1.2.3.4"]')
await page.type('input[placeholder*="1.2.3.4"]', '203.0.113.24')

console.log('\n=== 只加不需要证书的协议 ===')
await addBySelect('VLESS-REALITY')
await addBySelect('Shadowsocks 2022')
const titlesNoTls = await cardTitles()
console.log(JSON.stringify(titlesNoTls))
check('REALITY + SS 时不显示证书卡', !titlesNoTls.some((t) => t.startsWith('证书')))
check('REALITY + SS 时不显示证书页', !(await tabNames()).includes('证书'))

console.log('\n=== 加 Hysteria2 后证书出现 ===')
await addBySelect('Hysteria2')
const titlesTls = await cardTitles()
console.log(JSON.stringify(titlesTls))
check('出现证书卡', titlesTls.some((t) => t.startsWith('证书')))
check('出现证书页', (await tabNames()).includes('证书'))
check('默认自签', (await readState()).server.certMode === 'self')
const selfJson = await readJson()
check('自签配置含 certificate_path', selfJson.includes('"certificate_path"'))
check('自签配置无 certificate_providers', !selfJson.includes('certificate_providers'))
await shot('01-self-cert-card', true)

console.log('\n=== 切到 ACME ===')
await page.click('[aria-label="证书方式"]')
await wait(300)
const acmeHit = await clickByText('[role="option"]', 'ACME')
await wait(420)
check('已选中 ACME 选项', acmeHit)
let st = await readState()
check('状态 certMode=acme', st.server.certMode === 'acme', st.server.certMode)
const acmeJson = await readJson()
check('配置含 certificate_providers', acmeJson.includes('"certificate_providers"'))
check('入站引用 certificate_provider', acmeJson.includes('"certificate_provider": "acme"'))
check('ACME 下没有 certificate_path', !acmeJson.includes('"certificate_path"'))
check('证书卡徽标为 ACME', (await page.evaluate(() => document.body.innerText)).includes('ACME'))
await shot('02-acme-card', true)

console.log('\n=== ACME 链接不带 insecure ===')
await openTab('分享链接')
const acmeLinks = await linkUrls()
console.log(acmeLinks.join('\n'))
check('链接数 3', acmeLinks.length === 3, String(acmeLinks.length))
check('无 insecure', acmeLinks.every((url) => !/insecure/i.test(url)))

console.log('\n=== 切回自签，链接应重新带上 insecure ===')
await openTab('服务端配置')
await page.click('[aria-label="证书方式"]')
await wait(300)
await clickByText('[role="option"]', '自签')
await wait(420)
st = await readState()
check('状态 certMode=self', st.server.certMode === 'self', st.server.certMode)
check('自签配置恢复 certificate_path', (await readJson()).includes('"certificate_path"'))
await openTab('分享链接')
const selfLinks = await linkUrls()
check('自签链接带 insecure', selfLinks.some((url) => /insecure/i.test(url)))
await openTab('服务端配置')

console.log('\n=== 再切回 ACME ===')
await page.click('[aria-label="证书方式"]')
await wait(300)
await clickByText('[role="option"]', 'ACME')
await wait(420)
check('回到 ACME', (await readState()).server.certMode === 'acme')

console.log('\n=== 手改 JSON：端口 443 -> 2053 ===')
await openTab('服务端配置')
await editJson((cfg) => {
  const hy2 = cfg.inbounds.find((ib) => ib.type === 'hysteria2')
  hy2.listen_port = 2053
})
st = await readState()
const hy2 = st.nodes.find((n) => n.type === 'hysteria2')
check('左侧节点端口已同步', hy2.port === 2053, String(hy2.port))
check('manual 保留用户文本', st.manual !== null)

await clickByText('button', hy2.tag)
await wait(300)
const portValue = await page.$eval('input[type="number"]', (el) => el.value)
check('参数表单端口显示 2053', portValue === '2053', portValue)

await openTab('分享链接')
const portLinks = await linkUrls()
check('链接端口已更新', portLinks.some((url) => url.includes(':2053')))

console.log('\n=== 手改 JSON：改 tag 与 DNS ===')
await openTab('服务端配置')
await editJson((cfg) => {
  cfg.inbounds.find((ib) => ib.type === 'hysteria2').tag = 'hy2-renamed'
  cfg.dns.servers[0].server = '9.9.9.9'
})
st = await readState()
check('节点名已同步', st.nodes.some((n) => n.tag === 'hy2-renamed'))
check('DNS 已同步', st.server.dns === '9.9.9.9', st.server.dns)
const dnsInput = await page.$eval('input[placeholder="1.1.1.1"]', (el) => el.value)
check('服务器卡片 DNS 显示 9.9.9.9', dnsInput === '9.9.9.9', dnsInput)
const titlesAfter = await cardTitles()
check('节点列表出现新名字', (await page.evaluate(() => document.body.innerText)).includes('hy2-renamed'))
console.log('cards =', JSON.stringify(titlesAfter))

console.log('\n=== 手改 JSON：新增 / 删除入站 ===')
await editJson((cfg) => {
  const hy2 = JSON.parse(JSON.stringify(cfg.inbounds.find((ib) => ib.type === 'hysteria2')))
  hy2.tag = 'hy2-extra'
  hy2.listen_port = 2054
  cfg.inbounds.push(hy2)
})
st = await readState()
check('新增入站后左侧多一个节点', st.nodes.length === 4 && st.nodes.some((n) => n.tag === 'hy2-extra'))
await openTab('分享链接')
check('新增入站后多一条链接', (await linkUrls()).length === 4)
await openTab('服务端配置')

await editJson((cfg) => {
  cfg.inbounds = cfg.inbounds.filter((ib) => ib.tag !== 'hy2-extra')
})
st = await readState()
check('删除入站后节点收回', st.nodes.length === 3 && !st.nodes.some((n) => n.tag === 'hy2-extra'))

console.log('\n=== 手改 JSON：不可映射字段应被忽略 ===')
const before = JSON.stringify((await readState()).nodes)
await editJson((cfg) => {
  cfg.log.level = 'debug'
  cfg.route.rules.push({ protocol: 'dns', outbound: 'block' })
})
st = await readState()
check('节点未受影响', JSON.stringify(st.nodes) === before)
check('文本保留 log 改动', (await readJson()).includes('"level": "debug"'))
check('分享链接数仍为 3', (await (async () => {
  await openTab('分享链接')
  return linkUrls()
})()).length === 3)

console.log('\n=== 非法 JSON 不影响状态 ===')
await openTab('服务端配置')
const beforeInvalid = JSON.stringify((await readState()).nodes)
await setJson((await readJson()).slice(0, -12))
await wait(360)
const errText = await page.evaluate(() => {
  const hit = [...document.querySelectorAll('p')].find((el) =>
    (el.textContent ?? '').includes('JSON 语法错误'),
  )
  return hit?.textContent ?? null
})
check('显示语法错误', Boolean(errText), errText?.slice(0, 60))
check('状态未被破坏', JSON.stringify((await readState()).nodes) === beforeInvalid)
await shot('03-json-error', true)

console.log('\n=== 还原 ===')
await clickByText('button', '还原')
await wait(400)
st = await readState()
check('manual 清空', st.manual === null)
const restored = await readJson()
check('回到自动生成', restored.includes('"certificate_providers"') && !restored.includes('"debug"'))
check('自动生成沿用同步后的端口', JSON.parse(restored).inbounds.some((ib) => ib.listen_port === 2053))

const m = await metrics()
if (m) {
  const keys = ['fontSize', 'lineHeight', 'fontFamily', 'padding', 'letterSpacing', 'wordBreak', 'whiteSpace']
  const diff = keys.filter((k) => m.pre[k] !== m.ta[k])
  check('高亮层与输入层排版一致', diff.length === 0, diff.join(',') || 'aligned')
  check('内容高度一致', m.ta.scrollH === m.pre.scrollH, `${m.ta.scrollH} vs ${m.pre.scrollH}`)
}

console.log('\n=== 证书页内容 ===')
await openTab('证书')
const certText = await page.evaluate(() => document.body.innerText)
check('ACME 页显示 certificate_providers', certText.includes('certificate_providers'))
check('ACME 页提示 80/TCP', certText.includes('80/TCP'))
check('ACME 页无 openssl 命令', !certText.includes('openssl ecparam'))
await shot('04-cert-acme')

console.log('\n=== 清空后证书卡消失 ===')
await clickByText('button', '清空')
await wait(400)
const freed = await cardTitles()
check('清空后无证书卡', !freed.some((t) => t.startsWith('证书')))
check('清空后无证书页', !(await tabNames()).includes('证书'))
check('清空后配置为空入站', (await readJson()).includes('"inbounds": []'))
await shot('05-cleared', true)

console.log('\n=== problems ===')
console.log(problems.length === 0 ? 'none' : problems.join('\n'))

await browser.close()
