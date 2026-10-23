"""Regression checks for Cloudflare setup request filtering and safe diagnostics."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock
import urllib.error

spec = importlib.util.spec_from_file_location('turn_setup', Path(__file__).resolve().parents[1] / 'scripts/setup_cloudflare_turn.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class TurnSetup(unittest.TestCase):
    def test_named_client_requests_temporary_credentials(self):
        opener = MagicMock()
        response = opener.open.return_value.__enter__.return_value
        response.read.return_value = json.dumps({'iceServers': [{
            'urls': ['turn:turn.cloudflare.com:3478?transport=udp'],
            'username': 'temporary', 'credential': 'temporary-password'}]}).encode()
        with patch.object(setup.urllib.request, 'build_opener', return_value=opener):
            setup.verify('test-key-123', 'master-secret')
        request = opener.open.call_args.args[0]
        self.assertEqual(request.get_header('User-agent'), 'Cardinal3DLive/0.6')
        self.assertEqual(request.get_header('Authorization'), 'Bearer master-secret')
        self.assertEqual(json.loads(request.data), {'ttl': 14400})
        self.assertTrue(request.full_url.startswith('https://rtc.live.cloudflare.com/v1/turn/keys/'))

    def test_http_failures_are_distinct_and_do_not_disclose_response(self):
        for code in (401, 403, 404, 429, 503):
            with self.subTest(code=code):
                opener = MagicMock()
                opener.open.side_effect = urllib.error.HTTPError('https://private-url', code, 'master-secret', {}, io.BytesIO(b'master-secret'))
                with patch.object(setup.urllib.request, 'build_opener', return_value=opener):
                    with self.assertRaises(ValueError) as caught:
                        setup.verify('test-key-123', 'master-secret')
                self.assertIn(f'HTTP {code}', str(caught.exception))
                self.assertNotIn('master-secret', str(caught.exception))
                self.assertNotIn('private-url', str(caught.exception))

    def test_sandbox_network_error_is_not_reported_as_bad_key(self):
        opener = MagicMock()
        opener.open.side_effect = urllib.error.URLError(PermissionError('private detail'))
        with patch.object(setup.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(ValueError, 'File Explorer'):
                setup.verify('test-key-123', 'master-secret')


if __name__ == '__main__':
    unittest.main()
