import { BatchedMesh, Matrix4, Vector3, Source } from 'three';

const matrix = new Matrix4();
const vec1 = new Vector3();
const vec2 = new Vector3();
export class ModelViewBatchedMesh extends BatchedMesh {

	constructor( ...args ) {

		super( ...args );

		this.resetDistance = 1e4;
		this._matricesTextureHandle = null;
		this._lastCameraPos = new Matrix4();
		this._forceUpdate = true;

	}

	setMatrixAt( ...args ) {

		super.setMatrixAt( ...args );
		this._forceUpdate = true;

	}

	onBeforeRender( renderer, scene, camera, geometry, material, group ) {

		super.onBeforeRender( renderer, scene, camera, geometry, material, group );

		vec1.setFromMatrixPosition( camera.matrixWorld );
		vec2.setFromMatrixPosition( this._lastCameraPos );

		const matricesTexture = this._matricesTexture;
		let modelViewMatricesTexture = this._modelViewMatricesTexture;

		if (
			! modelViewMatricesTexture ||
			modelViewMatricesTexture.image.width !== matricesTexture.image.width ||
			modelViewMatricesTexture.image.height !== matricesTexture.image.height
		) {

			if ( modelViewMatricesTexture ) {

				modelViewMatricesTexture.dispose();

			}

			modelViewMatricesTexture = matricesTexture.clone();
			modelViewMatricesTexture.source = new Source( {
				...modelViewMatricesTexture.image,
				data: modelViewMatricesTexture.image.data.slice(),
			} );

			this._modelViewMatricesTexture = modelViewMatricesTexture;

		}


		if ( this._forceUpdate || vec1.distanceTo( vec2 ) > this.resetDistance ) {

			const matricesArray = matricesTexture.image.data;
			const modelViewArray = modelViewMatricesTexture.image.data;
			for ( let i = 0; i < this.maxInstanceCount; i ++ ) {

				matrix
					.fromArray( matricesArray, i * 16 )
					.premultiply( this.matrixWorld )
					.premultiply( camera.matrixWorldInverse )
					.toArray( modelViewArray, i * 16 );

			}

			modelViewMatricesTexture.needsUpdate = true;
			this._lastCameraPos.copy( camera.matrixWorld );
			this._forceUpdate = false;

		}

		this._matricesTextureHandle = this._matricesTexture;
		this._matricesTexture = this._modelViewMatricesTexture;
		this.matrixWorld.copy( this._lastCameraPos );

	}

	onAfterRender() {

		this.updateMatrixWorld();
		this._matricesTexture = this._matricesTextureHandle;
		this._matricesTextureHandle = null;

	}

	onAfterShadow( renderer, object, camera, shadowCamera, geometry, depthMaterial/* , group */ ) {

		this.onAfterRender( renderer, null, shadowCamera, geometry, depthMaterial );

	}

	dispose() {

		super.dispose();

		if ( this._modelViewMatricesTexture ) {

			this._modelViewMatricesTexture.dispose();

		}

	}

}