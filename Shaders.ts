/*
	Shader creation and management
*/

import * as THREE from './three.js';
import { DebugCanvas } from './DebugCanvas.js';


class DualPlaneShader {
	/*
		We're a very light-weight material and geometry construction system that pushes data for rendering with the multi-lod blending system.

		At the moment we don't do anything special with colours and lighting.
	*/

	constructor() {
	}

	protected _vertex_shader(): string {
		return `
			// Three Standard
			#include <common>

			// https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/lights_pars_begin.glsl.js
			#include <lights_pars_begin>

			// Predefined
			//uniform mat4 modelMatrix;
			//uniform mat4 modelViewMatrix;
			//uniform mat4 projectionMatrix;
			//uniform mat4 viewMatrix;
			//uniform mat3 normalMatrix;
			//uniform vec3 cameraPosition;

			// Our Stuff
			varying vec3 shared_position; 
			varying vec3 shared_normal; 
			varying vec2 shared_vUv; 
			varying vec4 modelViewPosition; 
			varying float factor;
			varying vec4 addedLights;

			uniform float factor_1; 
			uniform float factor_2; 
			uniform float factor_3; 
			uniform float factor_4; 

			attribute vec3 higher_position;
			attribute vec3 higher_normal;
			attribute vec2 higher_uv;
		
			void main() {

				/*
					Our stuff
				*/

				// Generate the blending factor, use the uv coordinates as plane basis function
				float u = uv.x;
				float v = uv.y;
				factor =  ( 1.0f - u ) * ( 1.0f - v ) * factor_1 +
								u * ( 1.0f - v ) * factor_3 +
								( 1.0f - u ) * v * factor_2 + 
								u * v * factor_4;

				// Blend normals
				shared_normal = mix( normal, higher_normal, factor );
	
				// Blend position
				shared_position = mix( position, higher_position, factor );

				// Standard output
				modelViewPosition = modelViewMatrix * vec4( shared_position, 1.0f );
				gl_Position = projectionMatrix * modelViewPosition; 

				// Lighting stuff
				addedLights = vec4( 0.0, 0.0, 0.0, 1.0 );
				for( int l = 0; l < NUM_POINT_LIGHTS; l++ ){
					vec3 lightDirection = normalize( position - pointLights[ l ].position );
					addedLights.rgb += clamp( 
											dot( -lightDirection, shared_normal ), 
											0.0, 1.0 ) * pointLights[ l ].color * 1.0;
				}
			
			}
	  `
	}


	protected _fragment_shader(): string {
		return `
			// Predefined
			//uniform mat4 viewMatrix;
			//uniform vec3 cameraPosition;

			// Ours
			uniform vec3 colorA; 
			uniform vec3 colorB; 

			varying vec3 shared_position;
			varying vec3 shared_normal;
			varying vec2 shared_vUv; 
			varying vec4 modelViewPosition; 
			varying float factor;
			varying vec4 addedLights;

			void main() {
				gl_FragColor = vec4( mix( colorA, colorB, factor ), 1.0f );
				gl_FragColor = mix( addedLights, gl_FragColor, 0.9f );
			}
 		 `
	}



	public generate_geometry( lower_lod: THREE.PlaneGeometry, higher_lod: THREE.PlaneGeometry ): THREE.BufferGeometry {
		/*
			We take two planes of the same size and create a buffer containing both suitable for the shaders.

			NOTE: Use standard attributes, if we don't BufferGeometry doesn't work (assume it uses them to fix internals sizes)
		*/

		const lower_lod_position_attribute = new THREE.Float32BufferAttribute( lower_lod.attributes.position.array, 3 );
		const higher_lod_position_attribute = new THREE.Float32BufferAttribute( higher_lod.attributes.position.array, 3 );

		const lower_lod_normal_attribute = new THREE.Float32BufferAttribute( lower_lod.attributes.normal.array, 3 );
		const higher_lod_normal_attribute = new THREE.Float32BufferAttribute( higher_lod.attributes.normal.array, 3 );

		const lower_lod_uvs_attribute = new THREE.Float32BufferAttribute( lower_lod.attributes.uv.array, 2 );
		const higher_lod_uvs_attribute = new THREE.Float32BufferAttribute( higher_lod.attributes.uv.array, 2 );

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', lower_lod_position_attribute );
		geometry.setAttribute( 'higher_position', higher_lod_position_attribute );

		geometry.setAttribute( 'normal', lower_lod_normal_attribute );
		geometry.setAttribute( 'higher_normal', higher_lod_normal_attribute );

		geometry.setAttribute( 'uv', lower_lod_uvs_attribute );
		geometry.setAttribute( 'higher_uv', higher_lod_uvs_attribute );

		lower_lod.setAttribute( 'higher_position', higher_lod_position_attribute );
		lower_lod.setAttribute( 'higher_normal', higher_lod_normal_attribute );
		lower_lod.setAttribute( 'higher_uv', higher_lod_uvs_attribute );

		return lower_lod;
	}


	public generate_material( factors: number[], lod_colours: THREE.Color[] ): THREE.ShaderMaterial {
		/*
			lod factor layout same as main calculation, top left, bottom left, top right, bottom right
			colors blend from factor = 0 to factor = 1

			factor_basis is the world space 

			We add standard three uniforms so we can use them in the shaders

			See docs for shadermaterial, there's a lot to set up.

			https://threejs.org/docs/#api/en/materials/ShaderMaterial.defines
		*/
		let uniforms = THREE.UniformsUtils.merge([
			THREE.UniformsLib.common,
			THREE.UniformsLib.specularmap,
			THREE.UniformsLib.envmap,
			THREE.UniformsLib.aomap,
			THREE.UniformsLib.lightmap,
			THREE.UniformsLib.emissivemap,
			THREE.UniformsLib.bumpmap,
			THREE.UniformsLib.normalmap,
			THREE.UniformsLib.displacementmap,
			THREE.UniformsLib.gradientmap,
			THREE.UniformsLib.fog,
			THREE.UniformsLib.lights,
			{
		
				// Our custom uniforms
				colorB: { type: 'vec3', value: lod_colours[ 0 ] },
				colorA: { type: 'vec3', value: lod_colours[ 1 ] },
				factor_1: { type: 'float', value: factors[ 0 ] },
				factor_2: { type: 'float', value: factors[ 1 ] },
				factor_3: { type: 'float', value: factors[ 2 ] },
				factor_4: { type: 'float', value: factors[ 3 ] },
			}]);

		// We use standard three shader fragments, we need to activate bits of them, see the fragment files at
		// https://github.com/mrdoob/three.js/tree/dev/src/renderers/shaders/ShaderChunk
		let defines = {
			//USE_UV: true,
		}

		let material =  new THREE.ShaderMaterial( {
			uniforms: uniforms,
			defines: defines,

			clipping: false,
			fog: false,
			lights: true,
			wireframe: true,

			fragmentShader: this._fragment_shader(),
			vertexShader: this._vertex_shader(),
		} );

		return material;
	}


	public generate_renderable( geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial ): THREE.Mesh {
		/*
			This can be added to the scene
		*/

		// @ts-ignore - this is fine from all the examples.
		return new THREE.Mesh( geometry, material );	

	}
}



export {
	DualPlaneShader
}