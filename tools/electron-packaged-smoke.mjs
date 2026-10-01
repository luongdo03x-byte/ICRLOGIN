import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { _electron as electron } from 'playwright';

const executablePath = resolve(process.env.ICRLOGIN_SMOKE_EXE || 'apps/desktop/dist/win-unpacked/ICRLogin.exe');
if (!existsSync(executablePath)) throw new Error(`Packaged ICRLogin executable not found: ${executablePath}`);

const application = await electron.launch({
  executablePath,
  env: {
    ...process.env,
    ICRLOGIN_UPDATE_URL: ''
  },
  timeout: 20_000
});

try {
  const window = await application.firstWindow({ timeout: 20_000 });
  await window.waitForSelector('#root', { state: 'attached', timeout: 15_000 });
  await window.waitForFunction(() => document.body.innerText.includes('ICRLogin'), undefined, { timeout: 15_000 });
  const title = await window.title();
  if (title !== 'ICRLogin') throw new Error(`Unexpected desktop title: ${title}`);
  const body = await window.locator('body').innerText();
  const englishShell = body.includes('Profiles') && body.includes('Settings');
  const vietnameseShell = body.includes('Hồ sơ') && body.includes('Cài đặt');
  if (!englishShell && !vietnameseShell) {
    throw new Error('ICRLogin navigation shell did not render');
  }
} finally {
  await application.close();
}
