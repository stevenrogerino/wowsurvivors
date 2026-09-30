"""The AI models make3d can use, behind one small interface.

Each backend turns picture(s) into a trimesh.Trimesh, tidies it, and paints
it. Heavy imports happen inside methods so `make3d --doctor` and the tests run
without a GPU or the models installed.
"""
import gc

# Pinned to the commit setup installs; see setup.ps1.
HUNYUAN_COMMIT = 'f8db63096c8282cb27354314d896feba5ba6ff8a'

HUNYUAN_LICENSE = ('Tencent Hunyuan 3D 2.0 Community License. Free for commercial use under 1M monthly users, '
                   'but NOT licensed in the EU, UK or South Korea, including distributing its output there.')


class TextureUnavailable(Exception):
    """The texture step can't run (its GPU kernel isn't built). The mesh is still usable."""


class ModelMissing(Exception):
    """The model files aren't on this PC yet."""


def _free_gpu():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


class Hunyuan:
    """Tencent Hunyuan3D-2: shape from one picture (or front/left/back/right), then paint."""

    # name: (Hugging Face repo, subfolder, description)
    VARIANTS = {
        'hunyuan': ('tencent/Hunyuan3D-2', 'hunyuan3d-dit-v2-0', 'Hunyuan3D-2, one picture, full quality'),
        'hunyuan-mv': ('tencent/Hunyuan3D-2mv', 'hunyuan3d-dit-v2-mv', 'Hunyuan3D-2mv, front/left/back/right pictures'),
        'hunyuan-mini': ('tencent/Hunyuan3D-2mini', 'hunyuan3d-dit-v2-mini', 'Hunyuan3D-2mini, faster, less detail'),
    }
    PAINT_REPO = 'tencent/Hunyuan3D-2'
    license = HUNYUAN_LICENSE

    def __init__(self, variant, log=print, low_vram=False):
        import torch
        self.variant = variant
        self.repo, self.subfolder, self.label = self.VARIANTS[variant]
        self.log = log
        self.low_vram = low_vram
        self.cuda = torch.cuda.is_available()
        self.device = 'cuda' if self.cuda else 'cpu'
        # Half precision on the GPU; the CPU (tests, no GPU) needs full precision.
        self.dtype = torch.float16 if self.cuda else torch.float32
        if not self.cuda:
            log('  WARNING: no CUDA GPU found - this will be extremely slow. Run make3d --doctor.')
        self._rembg = None

    @property
    def multiview(self):
        return self.variant == 'hunyuan-mv'

    def remove_background(self, image):
        if self._rembg is None:
            from hy3dgen.rembg import BackgroundRemover
            self._rembg = BackgroundRemover()
        return self._rembg(image.convert('RGB'))

    def shape(self, images, steps, octree, chunks, seed):
        import torch
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        try:
            pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
                self.repo, subfolder=self.subfolder, variant='fp16', device=self.device, dtype=self.dtype)
        except Exception as e:  # Offline and not downloaded, or a broken download.
            raise ModelMissing(f'{self.label} is not installed ({e}). Run: setup.bat -Models {self.variant}') from e
        if self.low_vram and self.cuda:
            pipe.enable_model_cpu_offload()
        image = images if self.multiview else images['front']
        mesh = pipe(image=image, num_inference_steps=steps, octree_resolution=octree, num_chunks=chunks,
                    generator=torch.manual_seed(seed), output_type='trimesh')[0]
        del pipe
        _free_gpu()
        return mesh

    def cleanup(self, mesh, max_faces):
        from hy3dgen.shapegen import FaceReducer, FloaterRemover, DegenerateFaceRemover
        mesh = FloaterRemover()(mesh)
        mesh = DegenerateFaceRemover()(mesh)
        return FaceReducer()(mesh, max_facenum=max_faces)

    def texture(self, mesh, images):
        try:
            import custom_rasterizer  # noqa: F401  (the compiled GPU kernel)
            from hy3dgen.texgen import Hunyuan3DPaintPipeline
        except ImportError as e:
            raise TextureUnavailable(f'the texture kernel is not built ({e}). Run setup.bat again to build it') from e
        try:
            paint = Hunyuan3DPaintPipeline.from_pretrained(self.PAINT_REPO)
        except Exception as e:
            raise ModelMissing(f'the Hunyuan3D-2 texture model is not installed ({e}). Run: setup.bat') from e
        if self.low_vram and self.cuda:
            paint.enable_model_cpu_offload()
        # The painter is conditioned on the front view.
        mesh = paint(mesh, image=images['front'])
        del paint
        _free_gpu()
        return mesh

    @classmethod
    def downloads(cls, variant, texture=True):
        """(repo, [allow patterns]) pairs to fetch for offline use."""
        repo, sub, _ = cls.VARIANTS[variant]
        out = [(repo, [f'{sub}/*'])]
        if texture:
            out.append((cls.PAINT_REPO, ['hunyuan3d-delight-v2-0/*', 'hunyuan3d-paint-v2-0-turbo/*']))
        return out


class Trellis:
    label = 'TRELLIS (Microsoft)'

    def __init__(self, *a, **k):
        raise NotImplementedError('TRELLIS support is the next step and is not installed yet. Use --model hunyuan for now.')


MODELS = {**{k: Hunyuan for k in Hunyuan.VARIANTS}, 'trellis': Trellis}


def create(name, log=print, low_vram=False):
    cls = MODELS[name]
    return cls(name, log=log, low_vram=low_vram) if cls is Hunyuan else cls()
