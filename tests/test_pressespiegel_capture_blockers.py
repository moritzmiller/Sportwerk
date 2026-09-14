from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRESSESPIEGEL = ROOT / "Pressespiegel"
for path in (ROOT, PRESSESPIEGEL):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import main as pressespiegel  # noqa: E402
from playwright.async_api import Error as PlaywrightError  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402


class PressespiegelCaptureBlockerTests(unittest.TestCase):
    def test_rhz_ad_or_premium_prompt_is_paywall_marker(self) -> None:
        html = """
        <html>
          <body>
            <article>
              <h1>Sportmeldung</h1>
              <p>Ein normal sichtbarer Teaser.</p>
            </article>
            <div role="dialog">
              Ihr Zugriff auf RHZ: Mit Werbung lesen oder Premium kaufen
            </div>
          </body>
        </html>
        """

        self.assertTrue(pressespiegel.has_paywall_marker(html))

    def test_adblocker_access_prompt_is_paywall_marker(self) -> None:
        self.assertTrue(
            pressespiegel.has_paywall_marker(
                "<article><h1>Titel</h1></article>",
                "Bitte Adblocker deaktivieren oder weiterlesen mit Werbung.",
            )
        )


class PressespiegelBrowserCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_clean_visible_page_removes_access_dialog_but_keeps_article(self) -> None:
        async with async_playwright() as playwright:
            try:
                browser = await playwright.chromium.launch()
            except PlaywrightError as exc:
                self.skipTest(f"Playwright Chromium ist nicht installiert: {exc}")

            page = await browser.new_page()
            try:
                await page.set_content(
                    """
                    <html>
                      <body>
                        <article>
                          <h1>Sportmeldung</h1>
                          <p>Dieser Artikel bleibt im Screenshot erhalten.</p>
                        </article>
                        <div role="dialog" style="position:fixed;inset:20px;z-index:99999">
                          Ihr Zugriff auf RHZ: Mit Werbung lesen oder Premium kaufen
                        </div>
                      </body>
                    </html>
                    """
                )

                await pressespiegel.clean_visible_page(page)

                self.assertEqual(await page.locator('[role="dialog"]').count(), 0)
                self.assertIn("Dieser Artikel bleibt", await page.locator("article").inner_text())
            finally:
                await browser.close()

    async def test_clean_visible_page_keeps_document_when_root_has_modal_class(self) -> None:
        async with async_playwright() as playwright:
            try:
                browser = await playwright.chromium.launch()
            except PlaywrightError as exc:
                self.skipTest(f"Playwright Chromium ist nicht installiert: {exc}")

            page = await browser.new_page()
            try:
                await page.set_content(
                    """
                    <html class="cmp-modal-open">
                      <body>
                        <main>
                          <article class="paywall">
                            <h1>Dresdner Christstollen</h1>
                            <p>Der frei sichtbare Artikeltext bleibt erhalten.</p>
                            <div class="upscore-paywall-placeholder">
                              <iframe id="upscore-paywall-offer0" class="upscore-paywall-offer"></iframe>
                            </div>
                          </article>
                        </main>
                        <div id="sp_message_container" role="dialog">
                          Ihr Zugriff auf rnz.de
                          <button>Alles akzeptieren</button>
                        </div>
                        <div class="cmp-root-container"></div>
                      </body>
                    </html>
                    """
                )

                await pressespiegel.clean_visible_page(page)

                self.assertEqual(await page.locator("body").count(), 1)
                self.assertEqual(await page.locator("#sp_message_container").count(), 0)
                self.assertEqual(await page.locator(".cmp-root-container").count(), 0)
                self.assertEqual(await page.locator(".upscore-paywall-placeholder").count(), 0)
                self.assertIn("Der frei sichtbare Artikeltext", await page.locator("article").inner_text())
            finally:
                await browser.close()

    async def test_clean_article_locator_removes_embedded_access_popup(self) -> None:
        async with async_playwright() as playwright:
            try:
                browser = await playwright.chromium.launch()
            except PlaywrightError as exc:
                self.skipTest(f"Playwright Chromium ist nicht installiert: {exc}")

            page = await browser.new_page()
            try:
                await page.set_content(
                    """
                    <html>
                      <body>
                        <main>
                          <article>
                            <h1>Sportmeldung</h1>
                            <p>Dieser Artikel bleibt im Screenshot erhalten.</p>
                            <section class="article-popup">
                              Ihr Zugriff auf rnz.de: Mit Werbung lesen oder Premium kaufen
                            </section>
                          </article>
                        </main>
                      </body>
                    </html>
                    """
                )

                article = page.locator("article")
                await pressespiegel.clean_article_locator(article)

                self.assertEqual(await page.locator(".article-popup").count(), 0)
                self.assertIn("Dieser Artikel bleibt", await article.inner_text())
            finally:
                await browser.close()

    async def test_settle_visible_page_for_capture_removes_delayed_popup(self) -> None:
        async with async_playwright() as playwright:
            try:
                browser = await playwright.chromium.launch()
            except PlaywrightError as exc:
                self.skipTest(f"Playwright Chromium ist nicht installiert: {exc}")

            page = await browser.new_page()
            try:
                await page.set_content(
                    """
                    <html>
                      <body>
                        <article>
                          <h1>Sportmeldung</h1>
                          <p>Dieser Artikel bleibt im Screenshot erhalten.</p>
                        </article>
                        <script>
                          setTimeout(() => {
                            const popup = document.createElement("div");
                            popup.id = "delayed_message_container";
                            popup.textContent = "Ihr Zugriff auf rnz.de: Premium kaufen";
                            popup.style.position = "fixed";
                            popup.style.inset = "20px";
                            popup.style.zIndex = "99999";
                            document.body.appendChild(popup);
                          }, 120);
                        </script>
                      </body>
                    </html>
                    """
                )

                await pressespiegel.settle_visible_page_for_capture(page, passes=3)

                self.assertEqual(await page.locator("#delayed_message_container").count(), 0)
                self.assertIn("Dieser Artikel bleibt", await page.locator("article").inner_text())
            finally:
                await browser.close()


if __name__ == "__main__":
    unittest.main()
