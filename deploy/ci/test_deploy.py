import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pcf_deploy', Path(__file__).with_name('deploy.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
SHA = 'a' * 40
SCHEMA = 'b' * 64
IMAGE = 'pcf/app:' + SHA
PREVIOUS = 'sha256:' + 'c' * 64


class ReleaseGuards(unittest.TestCase):
    def test_only_exact_deployment_command_is_accepted(self):
        self.assertEqual(deploy.parse_command(f'deploy {SHA} {SCHEMA}'), (SHA, SCHEMA))
        for command in ['', 'sh', f'deploy {SHA} {SCHEMA}; reboot',
                        f'deploy {SHA} {SCHEMA} extra', 'deploy ../../x invalid']:
            with self.subTest(command=command), self.assertRaises(ValueError):
                deploy.parse_command(command)

    def archive(self, tags):
        temporary = tempfile.NamedTemporaryFile(suffix='.tar.gz')
        data = json.dumps([{'RepoTags': tag} for tag in tags]).encode()
        with tarfile.open(fileobj=temporary, mode='w:gz') as archive:
            member = tarfile.TarInfo('manifest.json')
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
        temporary.flush()
        return temporary

    def test_rejects_other_projects_and_multi_image_archives(self):
        for tags in [[['mad-receipts/app:latest']], [[IMAGE, 'unrelated:latest']],
                     [[IMAGE], ['unrelated:latest']], []]:
            with self.subTest(tags=tags), self.archive(tags) as archive:
                with self.assertRaises(ValueError):
                    deploy.validate_archive(archive.name, IMAGE)
        with self.archive([[IMAGE]]) as archive:
            deploy.validate_archive(archive.name, IMAGE)

    def test_missing_or_duplicate_image_setting_is_rejected(self):
        for config in ['PCF_PORT=3107\n', 'PCF_IMAGE=a\nPCF_IMAGE=b\n']:
            with self.assertRaises(ValueError):
                deploy.with_image(config, IMAGE)


class DeploymentRollback(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        (self.base / '.env').write_text('PCF_IMAGE=pcf/app:old\nPCF_PORT=3107\n')
        for name, value in [('BASE', self.base)]:
            patcher = patch.object(deploy, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_success_changes_only_pcf_image_and_records_release(self):
        with patch.object(deploy, 'snapshot', return_value='unchanged'), \
             patch.object(deploy, 'run', return_value=PREVIOUS), \
             patch.object(deploy, 'compose_up') as compose, \
             patch.object(deploy, 'wait_healthy'):
            deploy.activate(IMAGE, SHA, SCHEMA)
        compose.assert_called_once()
        self.assertEqual((self.base / '.env').read_text(), f'PCF_IMAGE={IMAGE}\nPCF_PORT=3107\n')
        self.assertEqual(json.loads((self.base / 'release.json').read_text())['revision'], SHA)

    def test_unhealthy_release_restores_previous_image_id(self):
        with patch.object(deploy, 'snapshot', return_value='unchanged'), \
             patch.object(deploy, 'run', return_value=PREVIOUS), \
             patch.object(deploy, 'compose_up') as compose, \
             patch.object(deploy, 'wait_healthy', side_effect=[RuntimeError('unhealthy'), None]):
            with self.assertRaisesRegex(RuntimeError, 'unhealthy'):
                deploy.activate(IMAGE, SHA, SCHEMA)
        self.assertEqual(compose.call_count, 2)
        self.assertEqual((self.base / '.env').read_text(), f'PCF_IMAGE={PREVIOUS}\nPCF_PORT=3107\n')
        self.assertFalse((self.base / 'release.json').exists())

    def test_existing_project_change_also_rolls_back_pcf(self):
        with patch.object(deploy, 'snapshot', side_effect=['before', 'changed']), \
             patch.object(deploy, 'run', return_value=PREVIOUS), \
             patch.object(deploy, 'compose_up') as compose, \
             patch.object(deploy, 'wait_healthy'):
            with self.assertRaisesRegex(RuntimeError, 'existing project changed'):
                deploy.activate(IMAGE, SHA, SCHEMA)
        self.assertEqual(compose.call_count, 2)
        self.assertIn(PREVIOUS, (self.base / '.env').read_text())

    def test_migration_change_blocks_before_reading_upload_or_running_docker(self):
        (self.base / 'schema.sha256').write_text('different')
        with patch.dict('os.environ', {'SSH_ORIGINAL_COMMAND': f'deploy {SHA} {SCHEMA}'}), \
             patch.object(deploy, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'Migration files changed'):
                deploy.main()
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
