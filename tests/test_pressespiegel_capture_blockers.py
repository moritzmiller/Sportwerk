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

    def test_paywall_fallback_has_no_decorative_badge_or_separator(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "paywall.png"

            created = pressespiegel.render_paywall_fallback(
                image_path,
                "Geschuetzter Artikel",
                "Freie Presse",
                "18.09.2026",
                "https://www.freiepresse.de/beispiel",
                "Frei sichtbarer Teaser.",
                accent_hex="#004312",
            )

            self.assertTrue(created)
            with Image.open(image_path) as image:
                self.assertEqual(image.getpixel((132, 205)), (255, 255, 255))
                self.assertEqual(image.getpixel((720, 985)), (255, 255, 255))

    def test_link_error_fallback_has_no_decorative_badge_or_separator(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "link-error.png"

            created = pressespiegel.render_link_error_fallback(
                image_path,
                "Beispielquelle",
                "https://example.com/artikel",
                "Testfehler",
                accent_hex="#004312",
            )

            self.assertTrue(created)
            with Image.open(image_path) as image:
                self.assertEqual(image.getpixel((132, 205)), (255, 255, 255))
                self.assertEqual(image.getpixel((720, 615)), (255, 255, 255))

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

    def test_metadata_uses_url_host_as_source_and_visible_german_date(self) -> None:
        url = (
            "https://www.vfb.de/de/vfb/aktuell/neues/verein/2026/"
            "cannstatt-singt-----das-grosse-weihnachtssingen--swr3-praesentiert-besonderes-weihnachtsevent-in-der-mhp-arena/"
        )
        html = """
        <html>
          <head>
            <meta property="og:site_name" content="VfB Stuttgart">
            <meta property="og:title" content="Cannstatt singt">
          </head>
          <body>
            <div class="site-info">
              <div class="date"><a href="/de/vfb/aktuell/neues/verein/">Verein</a> 15. September 2026</div>
            </div>
          </body>
        </html>
        """

        title, site_name, article_date = pressespiegel.extract_article_metadata(html, url)

        self.assertEqual(title, "Cannstatt singt")
        self.assertEqual(site_name, "www.vfb.de")
        self.assertEqual(article_date, "15.09.2026")

    def test_google_result_url_is_used_as_article_source_url(self) -> None:
        url = (
            "https://www.google.de/url?"
            "q=https%3A%2F%2Fwww.vfb.de%2Fde%2Fartikel%2F&sa=U&ved=example"
        )

        self.assertEqual(
            pressespiegel.resolve_article_source_url("", url, url),
            "https://www.vfb.de/de/artikel/",
        )

    def test_prepare_urls_unwraps_gmail_google_redirects(self) -> None:
        url = (
            "https://www.google.com/url?"
            "q=https://www.vfb.de/de/vfb/aktuell/neues/verein/2026/cannstatt-singt/"
            "&source=gmail&ust=1790149233261000&usg=example"
        )

        urls, invalid = pressespiegel.prepare_urls([url])

        self.assertEqual(invalid, [])
        self.assertEqual(
            urls,
            ["https://www.vfb.de/de/vfb/aktuell/neues/verein/2026/cannstatt-singt/"],
        )

    def test_prepare_urls_preserves_duplicate_article_entries(self) -> None:
        direct_url = "https://www.vfb.de/de/artikel/"
        redirect_url = "https://www.google.de/url?q=https%3A%2F%2Fwww.vfb.de%2Fde%2Fartikel%2F"

        urls, invalid = pressespiegel.prepare_urls([direct_url, redirect_url])

        self.assertEqual(invalid, [])
        self.assertEqual(urls, [direct_url, direct_url])

    def test_canonical_article_url_wins_over_google_fallback_url(self) -> None:
        html = """
        <html>
          <head>
            <meta property="og:url" content="https://www.lvz.de/lokales/leipzig/beispiel.html">
            <link rel="canonical" href="https://www.google.de/url?q=https%3A%2F%2Fignored.example%2F">
          </head>
        </html>
        """

        self.assertEqual(
            pressespiegel.resolve_article_source_url(
                html,
                "https://www.google.de/url?q=https%3A%2F%2Fwww.lvz.de%2Flokales%2Fleipzig%2Fbeispiel.html",
                "https://www.google.de/url?q=https%3A%2F%2Fwww.lvz.de%2Flokales%2Fleipzig%2Fbeispiel.html",
            ),
            "https://www.lvz.de/lokales/leipzig/beispiel.html",
        )

    def test_article_domain_keeps_www_host(self) -> None:
        article = pressespiegel.ArticleResult(url="https://www.vfb.de/de/beispiel/", site_name="VfB Stuttgart")

        self.assertEqual(pressespiegel.article_domain(article), "www.vfb.de")

    def test_article_domain_prefers_resolved_source_url(self) -> None:
        article = pressespiegel.ArticleResult(
            url="https://www.google.de/url?q=https%3A%2F%2Fwww.vfb.de%2Fde%2Fbeispiel%2F",
            source_url="https://www.vfb.de/de/beispiel/",
            site_name="VfB Stuttgart",
        )

        self.assertEqual(pressespiegel.article_domain(article), "www.vfb.de")

    def test_source_logo_index_accepts_svg_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            logo_dir = Path(temp_dir)
            logo_path = logo_dir / "lvz.svg"
            logo_path.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">'
                '<rect width="120" height="40" fill="#111111"/></svg>',
                encoding="utf-8",
            )

            index = pressespiegel.build_source_logo_index(logo_dir)

            self.assertEqual(
                pressespiegel.find_source_logo(
                    index,
                    "https://www.lvz.de/lokales/leipzig/beispiel.html",
                    "Leipziger Volkszeitung",
                ),
                logo_path,
            )

    def test_source_logo_matching_prefers_exact_stem_over_shared_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            logo_dir = Path(temp_dir)
            die_zeit_logo = logo_dir / "logo_die-zeit.png"
            zeit_logo = logo_dir / "logo_zeit.png"
            Image.new("RGB", (80, 30), "#111111").save(die_zeit_logo)
            Image.new("RGB", (80, 30), "#222222").save(zeit_logo)

            index = pressespiegel.build_source_logo_index(logo_dir)

            self.assertEqual(
                pressespiegel.find_source_logo(index, "https://www.zeit.de/sport/beispiel", "ZEIT ONLINE"),
                zeit_logo,
            )

    def test_source_logo_matching_prefers_domain_logo_over_related_publication(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            logo_dir = Path(temp_dir)
            die_sachsen_logo = logo_dir / "logo_die-sachsen.png"
            sachsen_logo = logo_dir / "logo_sachsen.png"
            Image.new("RGB", (80, 30), "#111111").save(die_sachsen_logo)
            Image.new("RGB", (80, 30), "#222222").save(sachsen_logo)

            index = pressespiegel.build_source_logo_index(logo_dir)

            self.assertEqual(
                pressespiegel.find_source_logo(index, "https://www.sachsen.de/presse/beispiel", "Sachsen"),
                sachsen_logo,
            )

    def test_source_logo_matching_normalizes_umlauts_for_site_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            logo_dir = Path(temp_dir)
            logo_path = logo_dir / "logo_saechsische.png"
            Image.new("RGB", (80, 30), "#111111").save(logo_path)

            index = pressespiegel.build_source_logo_index(logo_dir)

            self.assertEqual(
                pressespiegel.find_source_logo(index, "https://www.saechsische.de/sport/beispiel", "Sächsische Zeitung"),
                logo_path,
            )

    def test_single_source_logo_is_used_as_safe_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            logo_dir = Path(temp_dir)
            logo_path = logo_dir / "uploaded-logo.png"
            Image.new("RGB", (80, 30), "#111111").save(logo_path)

            index = pressespiegel.build_source_logo_index(logo_dir)

            self.assertEqual(
                pressespiegel.find_source_logo(index, "https://example.com/artikel", "Unbekannte Quelle"),
                logo_path,
            )

    def test_pdf_image_column_starts_at_logo_edge_when_height_limited(self) -> None:
        image = Image.new("RGB", (400, 1200), "#FFFFFF")

        image_x, _image_y, final_width, _final_height = pressespiegel._calculate_image_column_geometry(
            image,
            column_x=42,
            column_width=240,
            content_top=780,
            content_bottom=48,
        )

        self.assertEqual(image_x, 42)
        self.assertLess(final_width, 240)


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
