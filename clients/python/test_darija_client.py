"""Run against a live server:  python3 -m unittest test_darija_client.py  (needs the server on DARIJA_URL)."""
import os
import unittest

from darija_client import DarijaClient, TranslatorError

URL = os.getenv("DARIJA_URL", "http://localhost:8080")


class LiveServerTest(unittest.TestCase):
    def test_health(self):
        self.assertEqual(DarijaClient(URL, "x", "y").health()["status"], "UP")

    def test_translate(self):
        t = DarijaClient(URL, "student", "darija2026").translate("Thank you very much", "English")
        self.assertTrue(t.translation)
        self.assertEqual(t.user, "student")

    def test_wrong_password(self):
        with self.assertRaises(TranslatorError) as ctx:
            DarijaClient(URL, "student", "nope").translate("hi")
        self.assertEqual(ctx.exception.status, 401)

    def test_empty_text(self):
        with self.assertRaises(TranslatorError) as ctx:
            DarijaClient(URL, "student", "darija2026").translate("   ")
        self.assertEqual(ctx.exception.status, 400)


if __name__ == "__main__":
    unittest.main()
