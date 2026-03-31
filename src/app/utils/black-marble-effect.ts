import { Effect, EffectAttribute, BlendFunction } from 'postprocessing';
import {
	DepthTexture,
	HalfFloatType,
	Matrix4,
	Object3D,
	PerspectiveCamera,
	Scene,
	Uniform,
	Vector2,
	Vector3,
	WebGLRenderer,
	WebGLRenderTarget,
} from 'three';

const REUSABLE_VECTOR2 = new Vector2();

const fragmentShader = /* glsl */ `
uniform sampler2D blackMarbleMap;
uniform sampler2D blackMarbleDepth;
uniform vec3 sunDirection;
uniform mat4 viewToECEFMatrix;
uniform vec2 projectionParams;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
	outputColor = inputColor;

	// Fall back to black marble depth when main scene has no geometry (e.g. Google tiles hidden)
	float effectiveDepth = depth;
	if (depth >= 1.0) {
		effectiveDepth = texture2D(blackMarbleDepth, uv).r;
		if (effectiveDepth >= 1.0) return;
	}

	// Reconstruct view Z from logarithmic depth buffer
	float logFarPlusOne = log2(cameraFar + 1.0);
	float absViewZ = pow(2.0, effectiveDepth * logFarPlusOne) - 1.0;

	// Reconstruct view position from NDC + projection
	vec2 ndc = uv * 2.0 - 1.0;
	vec3 viewPos = vec3(
		ndc.x * absViewZ / projectionParams.x,
		ndc.y * absViewZ / projectionParams.y,
		-absViewZ
	);

	// Transform view position directly to ECEF
	vec3 ecef = (viewToECEFMatrix * vec4(viewPos, 1.0)).xyz;
	vec3 surfaceNormal = normalize(ecef);

	// Day/night factor with smooth terminator transition
	float sunDot = dot(surfaceNormal, sunDirection);
	float nightFactor = smoothstep(0.05, -0.2, sunDot);
	if (nightFactor <= 0.0) return;

	// Sample the off-screen rendered black marble tiles
	vec4 nightColor = texture2D(blackMarbleMap, uv);

	// Add emissive city lights on the night side
	outputColor.rgb += nightColor.rgb * nightFactor;
}
`;

export class BlackMarbleEffect extends Effect {
	private blackMarble: Object3D | null = null;
	private worldToECEFMatrix = new Matrix4();
	private renderTarget = new WebGLRenderTarget(1, 1, {
		type: HalfFloatType,
		depthTexture: new DepthTexture(1, 1),
	});

	constructor(
		private scene: Scene,
		private camera: PerspectiveCamera,
		private earth: Object3D
	) {
		super('BlackMarbleEffect', fragmentShader, {
			attributes: EffectAttribute.DEPTH,
			blendFunction: BlendFunction.SET,
			uniforms: new Map<string, Uniform>([
				['blackMarbleMap', new Uniform(null)],
				['blackMarbleDepth', new Uniform(null)],
				['sunDirection', new Uniform(new Vector3())],
				['viewToECEFMatrix', new Uniform(new Matrix4())],
				['projectionParams', new Uniform(new Vector2())],
			]),
		});

		this.uniforms.get('blackMarbleMap')!.value = this.renderTarget.texture;
		this.uniforms.get('blackMarbleDepth')!.value = this.renderTarget.depthTexture;

		this.worldToECEFMatrix.copy(this.earth.matrixWorld).invert();
	}

	get sunDirection(): Vector3 {
		return this.uniforms.get('sunDirection')!.value as Vector3;
	}

	set blackMarbleTiles(blackMarbleTiles: Object3D) {
		if (blackMarbleTiles.parent !== this.earth) {
			throw new Error(
				'blackMarbleTiles must already be added to the scene graph as child of earth so it inherits the correct world transforms'
			);
		}
		this.blackMarble = blackMarbleTiles;
	}

	override update(renderer: WebGLRenderer, _inputBuffer: unknown, _deltaTime?: number): void {
		// Combined view-to-ECEF matrix (worldToECEF * cameraMatrixWorld)
		(this.uniforms.get('viewToECEFMatrix')!.value as Matrix4).multiplyMatrices(
			this.worldToECEFMatrix,
			this.camera.matrixWorld
		);

		// Projection params: P[0][0] and P[1][1]
		(this.uniforms.get('projectionParams')!.value as Vector2).set(
			this.camera.projectionMatrix.elements[0],
			this.camera.projectionMatrix.elements[5]
		);

		// Render black marble tiles to off-screen target
		if (this.blackMarble) {
			// Resize render target to match canvas
			const size = renderer.getSize(REUSABLE_VECTOR2);
			const pixelRatio = renderer.getPixelRatio();
			const w = Math.floor(size.x * pixelRatio);
			const h = Math.floor(size.y * pixelRatio);
			if (this.renderTarget.width !== w || this.renderTarget.height !== h) {
				this.renderTarget.setSize(w, h);
			}

			// Hide all earth children except black marble, then render only black marble
			const savedVisibility = new Map<Object3D, boolean>();
			for (const child of this.earth.children) {
				if (child !== this.blackMarble) {
					savedVisibility.set(child, child.visible);
					child.visible = false;
				}
			}
			this.blackMarble.visible = true;

			renderer.setRenderTarget(this.renderTarget);
			renderer.clear();
			renderer.render(this.scene, this.camera);
			renderer.setRenderTarget(null);

			// Restore visibility
			this.blackMarble.visible = false;
			for (const [child, wasVisible] of savedVisibility) {
				child.visible = wasVisible;
			}
		}
	}
}
