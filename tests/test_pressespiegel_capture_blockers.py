from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
PRESSESPIEGEL = ROOT / "Pressespiegel"
for path in (ROOT, PRESSESPIEGEL):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import main as pressespiegel  # noqa: E402
from PIL import Image  # noqa: E402
from playwright.async_api import Error as PlaywrightError  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402


class FakeUrlopenResponse:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit: int | None = None) -> bytes:
        return self.payload


class PressespiegelCaptureBlockerTests(unittest.TestCase):
    def test_article_image_url_can_be_extracted_from_srcset(self) -> None:
        html = """
        <html>
          <body>
            <article>
              <h1>Artikel mit Bild</h1>
              <picture>
                <source srcset="/cdn/hero-small.webp 640w, /cdn/hero-large.webp 1280w">
                <img src="/cdn/fallback.jpg" alt="">
              </picture>
            </article>
          </body>
        </html>
        """

        self.assertEqual(
            pressespiegel.extract_article_image_url(html, "https://www.freiepresse.de/sport/beispiel"),
            "https://www.freiepresse.de/cdn/hero-large.webp",
        )

    def test_lvz_url_is_recognized_for_source_login(self) -> None:
        self.assertTrue(
            pressespiegel.is_lvz_url(
                "https://www.lvz.de/lokales/leipzig/beispiel-artikel-ABC123.html"
            )
        )
        self.assertTrue(pressespiegel.is_lvz_url("https://epaper.lvz.de/beispiel"))
        self.assertFalse(pressespiegel.is_lvz_url("https://www.freiepresse.de/beispiel"))

    def test_lvz_auth_state_accepts_persistent_profile(self) -> None:
        with patch.object(type(pressespiegel.LVZ_STORAGE_STATE_PATH), "exists", return_value=False), patch.object(
            pressespiegel, "has_persistent_profile_state", return_value=True
        ):
            self.assertTrue(pressespiegel.has_lvz_auth_state())

    def test_radio_dresden_url_is_recognized_for_source_login(self) -> None:
        self.assertTrue(
            pressespiegel.is_radio_dresden_url(
                "https://www.radiodresden.de/beitrag/dynamo-dresden-beispiel-123456/"
            )
        )
        self.assertTrue(pressespiegel.is_radio_dresden_url("https://app.radiodresden.de/beispiel"))
        self.assertFalse(pressespiegel.is_radio_dresden_url("https://www.lvz.de/beispiel"))

    def test_radio_dresden_auth_state_accepts_persistent_profile(self) -> None:
        with patch.object(
            type(pressespiegel.RADIO_DRESDEN_STORAGE_STATE_PATH), "exists", return_value=False
        ), patch.object(pressespiegel, "has_persistent_profile_state", return_value=True):
            self.assertTrue(pressespiegel.has_radio_dresden_auth_state())

    def test_text_fallback_has_no_layout_accent_bar(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "fallback.png"

            created = pressespiegel.render_article_text_fallback(
                image_path,
                "Titel",
                "Freie Presse",
                "18.09.2026",
                "https://www.freiepresse.de/beispiel",
                [pressespiegel.ArticleTextBlock(kind="headline", text="Titel")],
                accent_hex="#004312",
            )

            self.assertTrue(created)
            with Image.open(image_path) as image:
                self.assertEqual(image.getpixel((8, 8)), (255, 255, 255))

    def test_saechsische_url_uses_matching_arc_rss_feed(self) -> None:
        url = (
            "https://www.saechsische.de/sport/regional/"
            "eiskanal-altenberg-zwei-weltcups-im-winter-2026-27-auftakt-mit-wulff-comeback-nach-dopingsperre-"
            "DCQ6YTVOHFDITIDI6EQ4PBKDFY.html"
        )

        self.assertEqual(
            pressespiegel.saechsische_rss_feed_candidates(url)[0],
            "https://www.saechsische.de/arc/outboundfeeds/rss/category/sport/regional/",
        )

    def test_saechsische_rss_article_is_extracted_from_official_feed(self) -> None:
        url = (
            "https://www.saechsische.de/sport/regional/"
            "eiskanal-altenberg-zwei-weltcups-im-winter-2026-27-auftakt-mit-wulff-comeback-nach-dopingsperre-"
            "DCQ6YTVOHFDITIDI6EQ4PBKDFY.html"
        )
        rss_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
        <rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
          <channel>
            <item>
              <title><![CDATA[Eiskanal Altenberg: Zwei Weltcups im Winter 2026/27]]></title>
              <link>{url}</link>
              <guid isPermaLink="true">{url}</guid>
              <description><![CDATA[Von November bis Februar finden am Eiskanal Altenberg zwei Weltcups statt.]]></description>
              <pubDate>Thu, 17 Sep 2026 17:55:00 +0200</pubDate>
              <media:content type="image/jpeg" url="https://www.saechsische.de/resizer/example.jpeg" />
            </item>
          </channel>
        </rss>""".encode("utf-8")
        requested_urls: list[str] = []

        def fake_urlopen(request, timeout=20):
            requested_urls.append(request.full_url)
            return FakeUrlopenResponse(rss_payload)

        with patch.object(pressespiegel, "urlopen", fake_urlopen):
            article = pressespiegel.fetch_saechsische_rss_article(url)

        self.assertIsNotNone(article)
        assert article is not None
        self.assertIn("Eiskanal Altenberg", article.title)
        self.assertEqual(article.site_name, "Sächsische.de")
        self.assertEqual(article.article_date, "17.09.2026")
        self.assertIn("zwei Weltcups", article.description)
        self.assertEqual(article.image_url, "https://www.saechsische.de/resizer/example.jpeg")
        self.assertEqual(
            requested_urls[0],
            "https://www.saechsische.de/arc/outboundfeeds/rss/category/sport/regional/",
        )

    def test_arc_fusion_article_body_is_extracted_for_saechsische_fallback(self) -> None:
        paragraphs = [
            "Der Sportverein aus Dresden berichtet ausführlich über die Vorbereitung, "
            "die Entscheidungen der Verantwortlichen und die nächsten Termine im Kalender. "
            "Dabei werden Hintergründe, Stimmen und konkrete Auswirkungen für die Region beschrieben.",
            "Der zweite Abschnitt schildert Gespräche mit Trainern, Athleten und Verantwortlichen. "
            "Er ordnet die Ergebnisse der vergangenen Wochen ein und erklärt, welche Aufgaben nun folgen.",
            "Im dritten Absatz geht es um konkrete Termine, organisatorische Details und Reaktionen aus dem Umfeld. "
            "Damit bleibt der Artikel für Leserinnen und Leser nachvollziehbar und vollständig.",
        ]
        html = f"""
        <html>
          <head>
            <script>
              Fusion.globalContent = {{
                "headlines": {{"basic": "Dresdner Sportmeldung mit vielen Details"}},
                "subheadlines": {{"basic": "Der Vorspann fasst die wichtigsten Punkte zusammen."}},
                "content_elements": [
                  {{"type": "text", "content": "<p>{paragraphs[0]}</p>"}},
                  {{"type": "header", "content": "Die wichtigsten Hintergründe"}},
                  {{"type": "text", "content": "<p>{paragraphs[1]}</p>"}},
                  {{"type": "text", "content": "<p>{paragraphs[2]}</p>"}}
                ]
              }};
            </script>
          </head>
          <body></body>
        </html>
        """

        blocks = pressespiegel.extract_article_text_blocks(html, "Fallback-Titel")

        self.assertGreaterEqual(sum(1 for block in blocks if block.kind == "paragraph"), 2)
        self.assertIn("Dresdner Sportmeldung", blocks[0].text)
        self.assertTrue(any(block.kind == "subheading" for block in blocks))
        self.assertGreater(sum(len(block.text) for block in blocks), 450)

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
