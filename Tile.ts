import * as THREE from './three.js';
import { Region }  from './Region.js';
import { PerlinTerrain } from './PerlinTerrain.js';

import Vector3 = THREE.Vector3;


class Tile {
	/*
		Manage a terrain tile at a particular LOD, generate interpolations to a lower LOD. Outputs to PlaneGeometry

		It always sits over the original data the size of the original region, we just reduce vertices depending on the lod level
	*/

	// Original representation
	protected terrain: PerlinTerrain;
	protected region: Region;

	// LOD data
	protected width: number;
	protected height: number;
	protected our_data: Float32Array;

	// 1 / 2^lod_factor represents the scaling factor for the amount of verts we deal with over the same region as the original data.
	protected lod_factor: number;

	constructor(
		terrain: PerlinTerrain,
		region: Region,

		width: number,
		height: number,
		our_data: Float32Array,

		lod_factor: number
	){
		/*
			Call one of the generators and not this directly.
		*/

		this.terrain = terrain;
		this.region = region;
		this.width = width;
		this.height = height;
		this.our_data = our_data;
		this.lod_factor = lod_factor;

	}



	/*
		Internals
	*/

	protected static _sample_region_from_perlin( region: Region, terrain: PerlinTerrain, lod_factor: number ): Tile {
		/*
			e.g. if the region species 0,0 -> 8,8 in the original data and we have a lod_factor of 1, we'll represent that same block down sampled, but only be 4 by 4.

			NOTE: We *always* sample from the original data, this may be slow, we should have another function to sample from a tile above us for speed.

			WARNING: The edges of this will be discontiguous with neighbouring regions and must be stitched together in a later step.
		*/

		// Create sizes, check
		lod_factor = Math.floor( lod_factor );
		if( lod_factor < 0 || lod_factor > 10 ){
			throw new RangeError( `Tile._sample_region_from_perlin(): lod out of range ${ lod_factor }` );
		}

		let power: number = 2 ** lod_factor;
		let power_squared: number = power * power;
		let inverse_power_squared: number = 1 / power_squared;

		let width: number = Math.floor( region.get_x_span() / power );
		let height: number = Math.floor( region.get_y_span() / power );
		let count: number = width * height;

		// Area in original region
		let u_start: number = region.get_x();
		let u_end: number = u_start + region.get_x_span();
		let v_start: number = region.get_y();
		let v_end: number = v_start + region.get_y_span();

		// Storage
		let our_data: Float32Array = new Float32Array( count )

		// We average boxes in the original data down, each box is power x power in size
		let index: number = 0;
		for( let y = 0, v = v_start; y < height; y++, v += power ){
			for( let x = 0, u = u_start; x < width; x++, u += power ){

				// x and y sample us, u and v sample the original tile, average a block from the original data power by power sized at u,v and write to x, y

				// Average the box in the source data
				let sum = terrain.sum_block( u, v, power, power );
				our_data[ index++ ] = sum * inverse_power_squared;
			}
		}


		return new Tile(
			terrain,
			region,

			width,
			height,
			our_data,

			lod_factor
		)

	}


	protected static _sample_from_lower_lod_level_tile( lower_lod_tile: Tile, lod_factor: number ): Tile {
		/*
			We exactly sample a tile that's at a lower resolution that us so our edges all lie along with, i.e. you can replace it with us when rendering. Used to handle lod lerping efficiently.
		*/

		// Check the thing we're running over has a higher lod level (lower res) than us
		lod_factor = Math.floor( lod_factor );
		if( lower_lod_tile.lod_factor <= lod_factor ){
			throw new RangeError( `Tile._sample_from_lower_lod_level_tile(): target tile has a lower or equal lod factor ${ lower_lod_tile.lod_factor } to us ${ lod_factor }` );
		}

		// Create sizes, check
		lod_factor = Math.floor( lod_factor );
		if( lod_factor < 0 || lod_factor > 10 ){
			throw new RangeError( `Tile._sample_from_lower_lod_level_tile(): lod out of range ${ lod_factor }` );
		}

		// Same region for us as the lower res tile
		let region = lower_lod_tile.region;

		// Our info
		let power: number = 2 ** lod_factor;
		let power_squared: number = power * power;
		let inverse_power_squared: number = 1 / power_squared;

		let width: number = Math.floor( region.get_x_span() / power );
		let height: number = Math.floor( region.get_y_span() / power );
		let count: number = width * height;

		// Coordinates in lower res tile
		let u_start: number = 0;
		let u_end: number = lower_lod_tile.width;
		let du = ( u_end - u_start ) / width;
		let v_start: number = 0;
		let v_end: number = lower_lod_tile.height;
		let dv = ( v_end - v_start ) / height;

		// Storage
		let our_data: Float32Array = new Float32Array( count )

		// We sample the lower resolution data at u, v doing a bilinear interpolation
		let index: number = 0;
		for( let y = 0, v = v_start; y < height; y++, v += dv ){
			for( let x = 0, u = u_start; x < width; x++, u += du ){

				// Sample the low res data at fractional coordinates, we use bilinear interpolation as that's exactly what a mesh is doing when rendered, the triangles are linear functions along the edges.
				
				// NOTE: If the middle is off it doesn't matter, only edges are important for lining up and lerping layers.

				// NOTE: Clamp out of range
				let s_u = Math.floor( u );
				let s_u_plus_one = Math.min( s_u + 1, lower_lod_tile.width - 1 );
				let s_v = Math.floor( v );
				let s_v_plus_one = Math.min( s_v + 1, lower_lod_tile.height - 1 );

				let top_left 		= lower_lod_tile.our_data[ s_u + ( s_v * lower_lod_tile.width ) ];
				let bottom_left 	= lower_lod_tile.our_data[ s_u + ( s_v_plus_one * lower_lod_tile.width ) ];
				let top_right 		= lower_lod_tile.our_data[ s_u_plus_one + ( s_v * lower_lod_tile.width ) ];
				let bottom_right 	= lower_lod_tile.our_data[ s_u_plus_one + ( s_v_plus_one * lower_lod_tile.width ) ];

				// Get fractional
				let frac_u = u - Math.floor( u );
				let frac_v = v - Math.floor( v );

				let sample = ( 1 - frac_u ) * ( 1 - frac_v ) * top_left +
								frac_u * ( 1 - frac_v ) * top_right +
								( 1 - frac_u ) * frac_v * bottom_left + 
								frac_u * frac_v * bottom_right;
				
				our_data[ index++ ] = sample;
			}
		}


		return new Tile(
			lower_lod_tile.terrain,
			region,

			width,
			height,
			our_data,

			lod_factor
		)

	}



	/*
		Constructors
	*/

	public static create_downsampled_tile( original_tile: Tile, lod_factor: number ): Tile {
		/*
			Generate a tile that represents the data of original_tile, but has lod_factor fewer count of indices in the x and y direction (represents a power of 2). factor must be 0 -> 10 and is used as an integer
		*/

		return Tile._sample_region_from_perlin(
			original_tile.region,
			original_tile.terrain,
			lod_factor
		)

	}


	public static create_tile_sampled_from_more_sparse_lod( lower_lod_tile: Tile, lod_factor: number ): Tile {
		/*
			This is used for our lod rendering, we need to exactly sample the lower lod tile at our higher lod, so when rendered the two are identical

			This is used for lerping either in software or vertex shaders, as we cannot use geometry, compute or tessellation shaders in WebGL 2.0 - good compromise.
		*/

		return Tile._sample_from_lower_lod_level_tile(
			lower_lod_tile,
			lod_factor
		)

	}



	public static create_master_tile( terrain: PerlinTerrain ): Tile {
		/*
			This represents the whole terrain and uses its data so we don't duplicate.
		*/

		return new Tile(
			terrain,
			terrain.get_region(),

			terrain.get_width(),
			terrain.get_height(),
			terrain.get_map(),

			0
		)
	}


	public static create_tile_from_region( terrain: PerlinTerrain, region: Region ): Tile {
		/*
			Create a tile covering this area from the original data, no lod scaling
		*/

		let data = terrain.return_region_data( region );

		return new Tile(
			terrain,
			region,

			region.get_x_span(),
			region.get_y_span(),
			data,

			0
		)
	}


	public average_to_tile_on_left( left: Tile ): void {
		/*
			Make the data on our left hand side match the passed tiles right hand side, the average of both.

			NOTE: Used for lod stitching, this is easier and faster than doing a complex supersample.
		*/

		// Check we're the same size
		if( this.width != left.width || this.height != left.height ){
			throw new RangeError( `Tile.average_to_tile_on_left(): our [ ${ this.width } ${ this.height } ] and other [ ${ left.width } ${ left.height } ] sizes don't match.` )
		}

		// Average both tiles' data
		for( let y = 0; y < this.height; y++ ){

			// RHS of left, and LHS of us
			let left_index = ( y * left.width ) + left.width - 1;
			let our_index = ( y * this.width );
			let average = ( left.our_data[ left_index ] + this.our_data[ our_index ] ) * 0.5;
			left.our_data[ left_index ] = average;
			this.our_data[ our_index ] = average;

		}

	}


	public average_to_tile_on_top( top: Tile ): void {
		/*
			Make the data on our top edge match the passed tiles bottom edge, the average of both.

			NOTE: Used for lod stitching, this is easier and faster than doing a complex supersample.
		*/	

		// Check we're the same size
		if( this.width != top.width || this.height != top.height ){
			throw new RangeError( `Tile.average_to_tile_on_top(): our [ ${ this.width } ${ this.height } ] and other [ ${ top.width } ${ top.height } ] sizes don't match.` )
		}

		// Average both tiles' data
		for( let x = 0; x < this.width; x++ ){

			// Bottom of top, and top of us
			let top_index = ( ( top.height - 1 ) * top.width ) + x;
			let our_index = x;
			let average = ( top.our_data[ top_index ] + this.our_data[ our_index ] ) * 0.5;
			top.our_data[ top_index ] = average;
			this.our_data[ our_index ] = average;

		}

	}


	public average_top_left_corner( left: Tile, top_left: Tile, top: Tile ): void {
		/*
			The two above functions leave the top left corner placed tile with a different value in its bottom right edge to the values of the top, and left. we want to average all three together
		*/

		// Right most pixel, top row
		let left_index = left.width - 1;

		// Bottom right entry
		let top_left_index = ( top_left.width * top_left.height ) - 1;

		// Bottom left entry
		let top_index = ( top.width * ( top.height - 1 ) );

		// Us, top left index
		let our_index = 0;

		let average = ( 
				left.our_data[ left_index ] + 
				top_left.our_data[ top_left_index ] + 
				top.our_data[ top_index ] +
				this.our_data[ our_index ] ) * 0.25;

		left.our_data[ left_index ] = average;
		top_left.our_data[ top_left_index ] = average;
		top.our_data[ top_index ] = average;
		this.our_data[ our_index ] = average;

	}



	public generate_plane_geometry( size: Vector3, origin: Vector3 ): THREE.PlaneGeometry {
		/*
			Generate a mesh just representing our region, offset in space so it renders in the correct position, pass the same size and origin as you used generating the mesh for the original perlin if using that as a reference, and keep the same size for all tiles referencing the same data as the region size doesn't change,
			just the amount of triangles we use to represent the area.
		*/

		// Our size is a fraction of the original and depends on our region size only
		// NOTE: The fewer verts we have, the bigger we are to compensate! 
		let terrain_region = this.terrain.get_region();
		let our_x_size = size.x * ( this.region.get_x_span() / terrain_region.get_x_span() );
		let our_z_size = size.z * ( this.region.get_y_span() / terrain_region.get_y_span() );

		//console.debug( `${ size.x } ${ size.z }`)
		//console.debug( `${ our_x_size } ${ our_z_size } ${ this.width } ${ this.height }`)

		// Where we are in space vs the original terrain data
		let our_x_offset = size.x * ( this.region.get_x() / this.terrain.get_width() );
		let our_z_offset = size.z * ( this.region.get_y() / this.terrain.get_height() );

		let plane = new THREE.PlaneGeometry( our_x_size, our_z_size, this.width - 1, this.height - 1 );
		plane.rotateX( - Math.PI / 2 );

		// Fill out y data, it'll all be zero
		const verts = plane.attributes.position.array;

		for ( let i = 0, j = 0, l = verts.length; i < l; i++, j += 3 ) {

			// Set height
			verts[ j + 1 ] = this.our_data[ i ] * size.y;

			// Shift origin in x and z 
			verts[ j + 0 ] += our_x_offset;
			verts[ j + 2 ] += our_z_offset;

			// Bake in origin
			verts[ j + 0 ] += origin.x;
			verts[ j + 1 ] += origin.y;
			verts[ j + 2 ] += origin.z;

		}

		// Done
		return plane;
	}


	public lerp( target_tile: Tile, factors: number[] ): Tile {
		/*
			This is used for the tile LOD, the tile must have the same resolution as us. See sample_lower_lod, the 

			* target_tile must have same resolution as us (see the way we have tiles that conform to the shape of lower res tiles in the lod list so we can do this lerp easily)
			* factors (which are linearly interpolated) are at each corner (0,0 - 0,1 - 1,0 - 1,1) which when set to 0 give our data, and when 1 give the target tile's data.

			NOTE: we use a fairly silly function to map between the 4 corners, we don't really care how it happens as long as we're continuous accross the patch, and matches adjoining patches

			NOTE: This and the whole way this works is designed to be webgl vertex shader compatible, else we'd do something way easier!.
		*/

		if( target_tile.region.is_equal( this.region ) == false ){
			throw new RangeError( `Tile.lerp(): region's represented were not equal, us: ${ this.region }, target: ${ target_tile.region }` )
		}

		let new_data = new Float32Array( this.our_data );

		let tile: Tile = new Tile(
			this.terrain,
			this.region,

			this.width,
			this.height,
			new_data,

			this.lod_factor
		)

		let index: number = 0; 
		let du: number = 1 / this.width;
		let dv: number = 1 / this.height;
		for( let y = 0, v = 0; y < this.width; y++, v+= dv ){
			for( let x = 0, u = 0; x < this.height; x++, u += du ){

				// Sample the target at this position, we're aiming to get to the exact 

				// Calculate factor for this point, bilinear interpolation accross the surface
				let factor = ( 1 - u ) * ( 1 - v ) * factors[ 0 ] +
								u * ( 1 - v ) * factors[ 2 ] +
								( 1 - u ) * v * factors[ 1 ] + 
								u * v * factors[ 3 ]


				new_data[ index ] = ( this.our_data[ index ] * ( 1 - factor ) ) + ( target_tile.our_data[ index ] * factor );

			}
		}

		// Done
		return tile;

	}


}



export {
	Tile
}