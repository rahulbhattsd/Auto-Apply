import asyncio
import pytest
from playwright.async_api import async_playwright, Route
from handlers.linkedin_handler import LinkedInHandler

@pytest.mark.asyncio
async def test_verify_submission_confirmed_phrases():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        context = await browser.new_context()
        page = await context.new_page()

        handler = LinkedInHandler(page)

        for phrase in [
            "Your application submitted!",
            "Great news, your application was sent to recruiter.",
            "Application was submitted successfully.",
            "Thank you for applying to ACME Corp.",
            "Application Sent!",
            "Your application has been sent.",
            "You applied on Jan 1, 2025",
        ]:
            await page.set_content(f"<html><body><div>{phrase}</div></body></html>")
            assert await handler._verify_submission_confirmed(page.locator("body")) is True

        await page.set_content("<html><body><div>Submit application button</div></body></html>")
        assert await handler._verify_submission_confirmed(page.locator("body")) is False

        await browser.close()


@pytest.mark.asyncio
async def test_apply_closed_modal_without_confirmation_returns_stuck():
    """Tests that if a modal closes or disappears without explicit confirmation text, status is 'stuck', NOT 'applied'."""
    html_modal_closes_no_confirmation = """
    <!DOCTYPE html>
    <html>
    <head><title>Job</title></head>
    <body>
        <button class="jobs-apply-button">Easy Apply</button>
        <div role="dialog" id="modal" style="display:none;">
            <button id="close-btn">Close modal</button>
        </div>
        <script>
            document.querySelector('.jobs-apply-button').addEventListener('click', () => {
                document.getElementById('modal').style.display = 'block';
                // Simulate modal closing unexpectedly or error without confirmation
                setTimeout(() => {
                    document.getElementById('modal').style.display = 'none';
                }, 100);
            });
        </script>
    </body>
    </html>
    """

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        context = await browser.new_context()
        page = await context.new_page()

        async def route_handler(route: Route):
            await route.fulfill(status=200, content_type="text/html", body=html_modal_closes_no_confirmation)

        await page.route("https://www.linkedin.com/jobs/view/999999", route_handler)

        handler = LinkedInHandler(page)
        res = await handler.apply("https://www.linkedin.com/jobs/view/999999")

        assert res["status"] == "stuck"
        assert "needs manual check" in res["reason"]

        await browser.close()


@pytest.mark.asyncio
async def test_apply_with_confirmed_submission_returns_applied():
    """Tests that when confirmation text appears after Easy Apply submission, status is 'applied'."""
    html_confirmed = """
    <!DOCTYPE html>
    <html>
    <head><title>Job</title></head>
    <body>
        <button class="jobs-apply-button">Easy Apply</button>
        <div role="dialog" id="modal" style="display:none;">
            <button type="button" id="submit-btn">Submit application</button>
        </div>
        <div id="confirmed" style="display:none;">Your application was sent</div>
        <script>
            document.querySelector('.jobs-apply-button').addEventListener('click', () => {
                document.getElementById('modal').style.display = 'block';
            });
            document.getElementById('submit-btn').addEventListener('click', () => {
                document.getElementById('modal').style.display = 'none';
                document.getElementById('confirmed').style.display = 'block';
            });
        </script>
    </body>
    </html>
    """

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        context = await browser.new_context()
        page = await context.new_page()

        async def route_handler(route: Route):
            await route.fulfill(status=200, content_type="text/html", body=html_confirmed)

        await page.route("https://www.linkedin.com/jobs/view/888888", route_handler)

        handler = LinkedInHandler(page)
        res = await handler.apply("https://www.linkedin.com/jobs/view/888888")

        assert res["status"] == "applied"
        assert res["reason"] is None

        await browser.close()
