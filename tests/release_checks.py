import hashlib, io, json, sys, tarfile, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from source_snapshot import verify_snapshot
from release_preflight import verify_source_archive
from build_manifest import inputs, verify_build

class ReleaseChecks(unittest.TestCase):
    def test_snapshot_rejects_changed_missing_and_escaping_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'plugins').mkdir();p=root/'plugins/Makefile';p.write_text('pinned')
            manifest={'commit':'abc','sha256':{'plugins/Makefile':hashlib.sha256(p.read_bytes()).hexdigest()}}
            path=root/'.source-snapshot.json';path.write_text(json.dumps(manifest))
            self.assertEqual(verify_snapshot(root,'abc'),1)
            with self.assertRaisesRegex(RuntimeError,'pin mismatch'):verify_snapshot(root,'def')
            p.write_text('changed')
            with self.assertRaisesRegex(RuntimeError,'changed'):verify_snapshot(root,'abc')
            p.unlink()
            with self.assertRaisesRegex(RuntimeError,'changed'):verify_snapshot(root,'abc')
            p.write_text('pinned');manifest['sha256']['../outside']='bad';path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(RuntimeError,'Unsafe'):verify_snapshot(root,'abc')

    def test_source_archive_requires_all_exact_revisions(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'source.tar.gz';pins={'cardinal':'a','bindings':'b','decoder':'c','codec':'d'}
            manifest={'project_commit':'project','repositories':{key:{'commit':pins[name]} for key,name in [('vendor/Cardinal/','cardinal'),('.tools/godot-cpp/','bindings'),('browser-decoder','decoder'),('server-codec','codec')]}}
            def write():
                with tarfile.open(path,'w:gz') as archive:
                    data=json.dumps(manifest).encode();item=tarfile.TarInfo('source/SOURCE_MANIFEST.json');item.size=len(data);archive.addfile(item,io.BytesIO(data))
            write();verify_source_archive(path,'project',pins)
            with self.assertRaisesRegex(RuntimeError,'commits differ'):verify_source_archive(path,'other',pins)
            del manifest['repositories']['browser-decoder'];write()
            with self.assertRaisesRegex(RuntimeError,'dependency'):verify_source_archive(path,'project',pins)

    def test_native_manifest_rejects_stale_source_and_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'bridge').mkdir();(root/'embedded').mkdir();(root/'scripts').mkdir()
            names=['upstream.lock.json','dependencies.lock.json','scripts/install_bridge.py','scripts/host_audio_cursor.py','scripts/build_embedded_windows.sh','scripts/bootstrap_windows.sh']
            for name in names:(root/name).write_text('original')
            (root/'rack/bin').mkdir(parents=True)
            for name in ('Cardinal3DEngine.dll','rack/bin/Cardinal3DEngine.dll','rack/bin/Cardinal3DExtension.dll'):(root/name).write_bytes(b'binary')
            binary=root/'Cardinal3DEngine.dll'
            manifest={'inputs':inputs(root),'outputs':{name:hashlib.sha256(binary.read_bytes()).hexdigest() for name in ('Cardinal3DEngine.dll','rack/bin/Cardinal3DEngine.dll','rack/bin/Cardinal3DExtension.dll')}}
            (root/'BUILD-MANIFEST.json').write_text(json.dumps(manifest));verify_build(root,root)
            binary.write_bytes(b'other')
            with self.assertRaisesRegex(RuntimeError,'output changed'):verify_build(root,root)
            (root/names[0]).write_text('changed')
            with self.assertRaisesRegex(RuntimeError,'source inputs'):verify_build(root,root)

if __name__=='__main__':unittest.main()
