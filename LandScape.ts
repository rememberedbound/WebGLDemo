import * as THREE from './three.js';
import { Region }  from './Region.js';
import { PerlinTerrain } from './PerlinTerrain.js';
import { DualPlaneShader } from './Shaders.js';
import { Tile } from './Tile.js'

import { 
	generate_empty_3d_array,
	power2_next_largest,
} from './Utilities.js';

import Vector3 = THREE.Vector3;



class LandScape {
	/*
		Handles our multi-resolution meshes using all the above, for this demo we exagerate the rendering to show the mesh lod blending.
	*/

	protected terrain: PerlinTerrain = null;
	protected lod_levels: number = null;
	protected x_splits: number = null;
	protected y_splits: number = null;
	protected size: Vector3 = null;
	protected origin: Vector3 = null;
	protected material: THREE.Material = null;

	// This is [ y entry ][ x entry ][ lod depth ] in size
	protected tile_lod_data: Tile[][][];

	// Same but contains plane geometry
	protected geometry_lod_data: THREE.PlaneGeometry[][][];

	// Same but contains meshes
	protected mesh_lod_data: THREE.Mesh[][][];

	// These three are the same as above, but each level is a higher resolution tile that's sampled to look like the lower resolution tile at the resolution lower, used for lerping. We have one less lod entry and the final has nothing to run sample against.
	// NOTE: All three are needed to do this in a vertex shader, if we're doing things in software we probably can't manipulate the mesh directly, so we'll be generating new PlaneGeometry and Mesh from lerp'd tile data per frame.
	protected lerp_tile_lod_data: Tile[][][];
	protected lerp_geometry_lod_data: THREE.PlaneGeometry[][][];
	protected lerp_mesh_lod_data: THREE.Mesh[][][];

	// Shader components
	protected shader_geometry_lod_data: THREE.BufferGeometry[][][];
	protected shader_mesh_lod_data: THREE.Mesh[][][];
	protected shader: DualPlaneShader;


	constructor(
		x_splits: number, 
		y_splits: number, 
		terrain: PerlinTerrain, 
		lod_levels: number, 

		// Size and origin of the meshes (baked into coordinates) - same as PerlinTerrain
		size: Vector3, 
		origin: Vector3,
		
		// Material to generate our meshes with
		material: THREE.Material
		) {
		/*
			We take the terrain (power of two sized), split it into a set of cells x_split by y_split (both powers of 2) in area and each lod_levels deep and create the geometry required for each level.

			We're designed so we feed 2 sets geometry per rendered tile to a vertex shader that handles the lerp between them depending on factors on each corner (bilinear interpolated), and we manage which levels of geometry get shown.

			For demo purposes make different levels different colours and keep it all wireframe so you can see what's going on.

			NOTE: As we're running like a mip map system, we effectively need 1/3 the extra memory (ish) over the original terrain. There are some overheads.

			size and origin have the same meanings as the PerlinTerrain and define the scaling and position of the mesh in space vs its anchor.
		*/

		this.terrain = terrain;
		this.lod_levels = lod_levels;
		this.x_splits = power2_next_largest( x_splits );
		this.y_splits = power2_next_largest( y_splits );
		this.size = size;
		this.origin = origin;
		this.material = material
		this.shader = new DualPlaneShader();

		this._construct_lod_data();
	}


	protected _construct_lod_data(): void {
		/*
			Construct all levels of data, store everything for now, it isn't that much in memory terms and is pretty quick to calculate as at worst we're just summing and averaging blocks.

			NOTE: We stitch together lod level edges here, using functions in Tile to do it.

			NOTE: We also create the lerping stage data, which is a tile at a higher res that conforms to the tile directly below it in res, used for lerping to more coarse lod levels in real time.
		*/

		// Get the region represented by the original data, split it up.
		let region = this.terrain.get_region();
		console.debug( this.x_splits )
		console.debug( this.y_splits )
		let regions: Region[][] = region.subdivide_region( this.x_splits, this.y_splits );

		// Generate arrays
		this.tile_lod_data = generate_empty_3d_array( this.lod_levels, this.x_splits, this.y_splits );
		this.geometry_lod_data = generate_empty_3d_array( this.lod_levels, this.x_splits, this.y_splits );
		this.mesh_lod_data = generate_empty_3d_array( this.lod_levels, this.x_splits, this.y_splits );

		// Create the highest resolution tile
		let master_tile = Tile.create_master_tile( this.terrain );

		// Generate tiles for each region in our lod_data, down to the level we've been we
		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){

				// Create the base tile for this area, this is lod zero
				let region_master_tile: Tile = Tile.create_tile_from_region(
					this.terrain,
					regions[ y ][ x ]
				)
				this.tile_lod_data[ y ][ x ][ 0 ] = region_master_tile;

				// For this particular block, we make each lod level have half the number of vertices as the original in both directions
				for( let lod = 1; lod < this.lod_levels; lod++ ){

					//console.debug( lod )
					//console.debug( region_master_tile )

					this.tile_lod_data[ y ][ x ][ lod ] = Tile.create_downsampled_tile(
						region_master_tile,
						lod
					)

				}

			}
		}

		// Stitch the edges of all the data at each lod level, the simple area average we've done in Tile.create_downsamples_tile will not match, which is fine
		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){

				for( let lod = 1; lod < this.lod_levels; lod++ ){

					// Check for tile to the left
					if( x > 0 ){

						// Set both tiles edges to the average of both
						let tile = this.tile_lod_data[ y ][ x ][ lod ];
						let left_tile = this.tile_lod_data[ y ][ x - 1 ][ lod ];
						tile.average_to_tile_on_left( left_tile );

					}

					// Check for tile to the top
					if( y > 0 ){

						// Set both tiles edges to the average of both
						let tile = this.tile_lod_data[ y ][ x ][ lod ];
						let top_tile = this.tile_lod_data[ y - 1 ][ x ][ lod ];
						tile.average_to_tile_on_top( top_tile );

					}

					// And both, fix the boundary corners
					if( x > 0 && y > 0 ){
						let tile = this.tile_lod_data[ y ][ x ][ lod ];

						let left_tile = this.tile_lod_data[ y ][ x - 1 ][ lod ];
						let top_left_tile = this.tile_lod_data[ y - 1 ][ x - 1 ][ lod ];
						let top_tile = this.tile_lod_data[ y - 1 ][ x ][ lod ];
						
						tile.average_top_left_corner(
							left_tile,
							top_left_tile,
							top_tile
						)

					}

				}

			}
		}

		// Generate 3D geometry
		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){
		
				// Build the plane and mesh data for each lod level (including first)
				for( let lod = 0; lod < this.lod_levels; lod++ ){

					// Plane data
					this.geometry_lod_data[ y ][ x ][ lod ] = this.tile_lod_data[ y ][ x ][ lod ].generate_plane_geometry(
						this.size,
						this.origin
					)

					// Mesh data
					this.mesh_lod_data[ y ][ x ][ lod ] = new THREE.Mesh( this.geometry_lod_data[ y ][ x ][ lod ], <THREE.MeshBasicMaterial>this.material );

				}

			}
		}

		// Generate the lerping data, the tile at lod zero is sampled as the tile at lod one from above, this lets us lerp lod zero from both sets to smoothly move between levels.
		// NOTE: This means we have one less lod level than the above.

		// Generate arrays
		this.lerp_tile_lod_data = generate_empty_3d_array( this.lod_levels - 1, this.x_splits, this.y_splits );
		this.lerp_geometry_lod_data = generate_empty_3d_array( this.lod_levels - 1, this.x_splits, this.y_splits );
		this.lerp_mesh_lod_data = generate_empty_3d_array( this.lod_levels - 1, this.x_splits, this.y_splits );

		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){
		
				for( let lod = 0; lod < this.lod_levels - 1; lod++ ){

					// First the lerp tile, we sample from lod + 1 in our standard set, but at lod
					this.lerp_tile_lod_data[ y ][ x ][ lod ] = Tile.create_tile_sampled_from_more_sparse_lod(
						this.tile_lod_data[ y ][ x ][ lod + 1 ],
						lod
					)

					// Lerp Plane data
					this.lerp_geometry_lod_data[ y ][ x ][ lod ] = this.lerp_tile_lod_data[ y ][ x ][ lod ].generate_plane_geometry(
						this.size,
						this.origin
					)

					// Lerp Mesh data
					this.lerp_mesh_lod_data[ y ][ x ][ lod ] = new THREE.Mesh( this.lerp_geometry_lod_data[ y ][ x ][ lod ], <THREE.MeshBasicMaterial>this.material );

				}
			}
		}


		/*
			Generate the data for the shader rendering, we can modify the uniforms on these dynamically for speed
		*/

		// Generate Arrays
		this.shader_geometry_lod_data = generate_empty_3d_array( this.lod_levels - 1, this.x_splits, this.y_splits );
		this.shader_mesh_lod_data = generate_empty_3d_array( this.lod_levels - 1, this.x_splits, this.y_splits );

		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){
		
				for( let lod = 0; lod < this.lod_levels - 1; lod++ ){

					let shader_geometry = this.shader.generate_geometry( 
						this.lerp_geometry_lod_data[ y ][ x ][ lod ],
						this.geometry_lod_data[ y ][ x ][ lod ]
					)

					let alphas: number[] = [ 0.0, 0.0, 0.0, 0.0 ];

					let shader_material = this.shader.generate_material( 
						alphas, [ 
							new THREE.Color( 0x1e2963 ), new THREE.Color( 0xbf2a7f ) 
						] );

					let mesh = this.shader.generate_renderable( 
						shader_geometry,
						shader_material
					);

					// Save
					this.shader_geometry_lod_data[ y ][ x ][ lod ] = shader_geometry;
					this.shader_mesh_lod_data[ y ][ x  ][ lod ] = mesh;

				}
			}
		}

		console.debug( `LandScape._construct_lod_data(): ${ this.x_splits } by ${ this.y_splits } blocks, ${ this.lod_levels } deep.` )

	}


	/*
		Access and rendering
	*/

	public get_meshes_for_lod_level( lod_level: number ): THREE.Mesh[] {
		/*
			Render with no interpolation, coloured and laid out the same as if we're using vertex shader interpolation to make things seamless.
		*/

		let out: THREE.Mesh[] = [];

		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){
				out.push( this.mesh_lod_data[ y ][ x ][ lod_level ] );
			}
		}

		return out;

	}


	public demo_do_lod_lerp_for_factors( factors: number[][] ): THREE.Mesh[] {
		/*
			Very simple demo of LOD mesh changes, factors is an array ( x_splits + 1 ) * ( y_splits + 1 ) that gives the lod level for every corner of every tile.

			We give back the highest resolution mesh those represent per area, lerped with the lowest resolution mesh in that area.

			NOTE: This would be done in a vertex shader for speed, this just demos the idea. Same algorithm.
		*/

		let out: THREE.Mesh[] = [];

		// check factors is the right size (only check primary dimension)
		if( factors.length != ( this.y_splits + 1 ) ){
			throw new RangeError( `LandScape.demo_do_lod_lerp_for_factors(): factors array is the wrong size, was ${ factors.length }, should be ${ ( this.y_splits + 1 ) }` );
		}

		// Dynamically generate
		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){

				// Get the lod factors
				let factor_1 = factors[ y ][ x ];
				let factor_2 = factors[ ( y + 1 ) ][ x ];
				let factor_3 = factors[  y ][ ( x + 1 ) ];
				let factor_4 = factors[ ( y + 1 ) ][ ( x + 1 ) ];
				let lods: number[] = [ factor_1, factor_2, factor_3, factor_4 ];

				// Check they're in range

				// Get the lowest lod (highest number)
				let lower_res_lod = Math.max( factor_1, Math.max( factor_2, Math.max( factor_3, factor_4 )));

				// Get highest lod (lowest number), we're pushing to that
				let upper_res_lod = Math.min( factor_1, Math.min( factor_2, Math.min( factor_3, factor_4 )));

				upper_res_lod = Math.round( upper_res_lod );
				lower_res_lod = Math.round( lower_res_lod );

				// Get the higher res tile
				let high_res_tile: Tile = this.tile_lod_data[ y ][ x ][ upper_res_lod ];

				// Get the lerp version of the lower res tile, which is the same resolution as the above, but conforms in shape to the level below
				let lower_res_tile: Tile = this.lerp_tile_lod_data[ y ][ x ][ upper_res_lod ];

				// Generate the factors 0->1 within the two lods that lerp uses
				let alphas: number[] = [
					factor_1 - Math.floor( factor_1 ),
					factor_2 - Math.floor( factor_2 ),
					factor_3 - Math.floor( factor_3 ),
					factor_4 - Math.floor( factor_4 ),
				]

				// DEBUG: Lets make the factors integer
				//alphas = [
				//	Math.floor( factor_1 ),
				//	Math.floor( factor_2 ),
				//	Math.floor( factor_3 ),
				//	Math.floor( factor_4 ),
				//]

				// Do a software lerp
				let lerped_tile: Tile = high_res_tile.lerp( lower_res_tile, alphas );

				// Generate the mesh
				let geometry = lerped_tile.generate_plane_geometry(
					this.size,
					this.origin
				)
				let mesh = new THREE.Mesh( geometry, <THREE.MeshBasicMaterial>this.material );

				// Done
				out.push( mesh );

				// DEBUG: Push highest lod tile, see if they calculate right
				//out.push( this.lerp_mesh_lod_data[ y ][ x ][ lower_res_lod ] )
			}
		}

		return out;

	}


	public demo_shader_render_with_factors( factors: number[][] ): THREE.Mesh[] {
		/*
			Same as above but run with shaders.
		*/

		let out: THREE.Mesh[] = [];

		// check factors is the right size (only check primary dimension)
		if( factors.length != ( this.y_splits + 1 ) ){
			throw new RangeError( `LandScape.demo_shader_render_with_factors(): factors array is the wrong size, was ${ factors.length }, should be ${ ( this.y_splits + 1 ) }` );
		}

		// Dynamically generate
		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){

				// Get the lod factors
				let factor_1 = factors[ y ][ x ];
				let factor_2 = factors[ ( y + 1 ) ][ x ];
				let factor_3 = factors[  y ][ ( x + 1 ) ];
				let factor_4 = factors[ ( y + 1 ) ][ ( x + 1 ) ];
				let lods: number[] = [ factor_1, factor_2, factor_3, factor_4 ];

				// Check they're in range

				// Get the lowest lod (highest number)
				let lower_res_lod = Math.max( factor_1, Math.max( factor_2, Math.max( factor_3, factor_4 )));

				// Get highest lod (lowest number), we're pushing to that
				let upper_res_lod = Math.min( factor_1, Math.min( factor_2, Math.min( factor_3, factor_4 )));

				upper_res_lod = Math.round( upper_res_lod );
				lower_res_lod = Math.round( lower_res_lod );

				// Get the higher res plane geometry
				let high_res_geometry = this.geometry_lod_data[ y ][ x ][ upper_res_lod ];

				// Get the lerp version of the lower res tile, which is the same resolution as the above, but conforms in shape to the level below - uses same index as above because array is shifted
				let lower_res_geometry = this.lerp_geometry_lod_data[ y ][ x ][ upper_res_lod ];

				// Generate the factors 0->1 within the two lods that lerp uses
				let alphas: number[] = [
					factor_1 - Math.floor( factor_1 ),
					factor_2 - Math.floor( factor_2 ),
					factor_3 - Math.floor( factor_3 ),
					factor_4 - Math.floor( factor_4 ),
				];

				let shader_geometry = this.shader.generate_geometry(
					lower_res_geometry,
					high_res_geometry
				)

				let shader_material = this.shader.generate_material( 
					alphas, [ 
						new THREE.Color( 0x1e2963 ), new THREE.Color( 0xbf2a7f ) 
					] );

				let mesh = this.shader.generate_renderable( 
					shader_geometry,
					shader_material
				);

				// Done
				out.push( mesh );

			}
		}

		return out;

	}



	public demo_shader_render_careful_uniforms( factors: number[][] ): THREE.Mesh[] {
		/*
			Same as above but we don't regen anything per frame, we use existing meshes
		*/

		let out: THREE.Mesh[] = [];

		// check factors is the right size (only check primary dimension)
		if( factors.length != ( this.y_splits + 1 ) ){
			throw new RangeError( `LandScape.demo_shader_render_careful_uniforms(): factors array is the wrong size, was ${ factors.length }, should be ${ ( this.y_splits + 1 ) }` );
		}

		// Dynamically generate
		for( let y = 0; y < this.y_splits; y++ ){
			for( let x = 0; x < this.x_splits; x++ ){

				// Get the lod factors
				let factor_1 = factors[ y ][ x ];
				let factor_2 = factors[ ( y + 1 ) ][ x ];
				let factor_3 = factors[  y ][ ( x + 1 ) ];
				let factor_4 = factors[ ( y + 1 ) ][ ( x + 1 ) ];

				// Check they're in range

				// Get the lowest lod (highest number)
				let lower_res_lod = Math.max( factor_1, Math.max( factor_2, Math.max( factor_3, factor_4 )));

				// Get highest lod (lowest number), we're pushing to that
				let upper_res_lod = Math.min( factor_1, Math.min( factor_2, Math.min( factor_3, factor_4 )));

				upper_res_lod = Math.round( upper_res_lod );
				lower_res_lod = Math.round( lower_res_lod );

				// Grab the pre-generated mesh
				let mesh = this.shader_mesh_lod_data[ y ][x ][ upper_res_lod ];

				// Change the uniforms in the mesh to have those factors
				// @ts-ignore
				mesh.material.uniforms.factor_1.value = factor_1 - Math.floor( factor_1 ); // @ts-ignore
				mesh.material.uniforms.factor_2.value = factor_2 - Math.floor( factor_2 ); // @ts-ignore
				mesh.material.uniforms.factor_3.value = factor_3 - Math.floor( factor_3 ); // @ts-ignore
				mesh.material.uniforms.factor_4.value = factor_4 - Math.floor( factor_4 );

				// Set the colour uniforms too
				// @ts-ignore
				mesh.material.uniforms.colorA.value = new THREE.Color( 0x1e2963 ); // @ts-ignore
				mesh.material.uniforms.colorB.value = new THREE.Color( 0xbf2a7f ); 

				// Done
				out.push( mesh );

			}
		}

		return out;

	}

}



export {
	LandScape
}