import * as THREE from './three.js';
import * as ImprovedNoise from './ImprovedNoise.js';
import { 
	power2_next_largest,
	bicubic } from './Utilities.js';
import { Region }  from './Region.js';

import Vector3 = THREE.Vector3;


class PerlinTerrain {
	/*
		Generate and hold height map data for the entire terrain, not used for rendering.

		NOTE: Generation is slow, recommend that you build a height map < 512 x 512 and interpolate out later.
	*/

	protected width: number;
	protected height: number;
	protected width_mask: number;
	protected height_mask: number;
	protected count: number;
	protected map: Float32Array;

	constructor(
		width: number,
		height: number
	){
		/*
			Initially we're just all zeros, due to calculation complexity let the user do multires

			NOTE: width and height must be powers of two.
		*/
		this.width = power2_next_largest( width );
		this.height = power2_next_largest( height );

		this.width_mask = this.width - 1;
		this.height_mask = this.height - 1;

		this.count = this.width * this.height;
		this.map = new Float32Array( this.count );
	}



	/*
		Generators
	*/

	public generate_perlin_height_map(): void {
		/*
			NOTE: slow, see the noise function, can speed that up by running iteratively.
		*/

		let perlin = new ImprovedNoise.ImprovedNoise();
		let z = Math.random();
		let quality = 1;
	
		for ( let j = 0; j < 4; j++ ) {
	
			let index: number = 0;
			for ( let x = 0; x < this.width; x++ ) {
				for ( let y = 0; y < this.height; y++ ) {
					this.map[ index++ ] += perlin.noise( x / quality, y / quality, z ) * quality * ( 1.0 / 25.0 );
				}
			}

			quality *= 5;
		}

	}


	public interpolate_from_terrain( terrain: PerlinTerrain ): void {
		/*
			Do a cubic interpolation of the input up to our size.

			NOTE: Expects to sample from a smaller size.
		*/

		let other_map = terrain.get_map();
		let other_width = terrain.get_width();
		let other_height = terrain.get_height();
		let other_width_mask = terrain.get_width_mask();
		let other_height_mask = terrain.get_height_mask();
		let other_count = terrain.get_count();

		if( other_width > this.width ){
			throw new RangeError( `PerlinTerrain.interpolate_from_terrain(): sampling terrain width ${ other_width } > our width ${ this.width }` );
		}

		if( other_height > this.height ){
			throw new RangeError( `PerlinTerrain.interpolate_from_terrain(): sampling terrain height ${ other_height } > our height ${ this.height }` );
		}

		
		let index: number = 0;
		let sample_y: number = 0;
		let dx: number = other_width / this.width;
		let dy: number = other_height / this.height;

		//console.debug( `dx: ${ dx } dy: ${ dy }` )

		function sample( index_x: number, index_y: number, off_x: number, off_y: number ): number {
			return other_map[ 
				( ( index_x + off_x ) & other_width_mask ) + 
				( ( ( index_y + off_y ) & other_height_mask ) * other_width ) 
			];
		}

		for ( let y = 0; y < this.height; y++, sample_y += dy ) {

			let sample_x: number = 0;
			for ( let x = 0; x < this.width; x++, sample_x += dx ) {

				// get fractional
				let frac_x: number = sample_x - Math.floor( sample_x );
				let frac_y: number = sample_y - Math.floor( sample_y );

				// we sample a 4x4 block around the sampling coordinate, 0,0 for example would be dead in the middle of a block on a boundary between 4 texels. We wrap around (hence the reason for the power of 2 limit).
				let index_x: number = Math.floor( sample_x );
				let index_y: number = Math.floor( sample_y );

				// Sample Neighbourhood
				let p00: number = sample( index_x, index_y, -2, -2 );
				let p01: number = sample( index_x, index_y, -1, -2 );
				let p02: number = sample( index_x, index_y, 0, -2 );
				let p03: number = sample( index_x, index_y, 1, -2 );

				let p10: number = sample( index_x, index_y, -2, -1 );
				let p11: number = sample( index_x, index_y, -1, -1 );
				let p12: number = sample( index_x, index_y, 0, -1 );
				let p13: number = sample( index_x, index_y, 1, -1 );

				let p20: number = sample( index_x, index_y, -2, 0 );
				let p21: number = sample( index_x, index_y, -1, 0 );
				let p22: number = sample( index_x, index_y, 0, 0 );
				let p23: number = sample( index_x, index_y, 1, 0 );

				let p30: number = sample( index_x, index_y, -2, 0 );
				let p31: number = sample( index_x, index_y, -1, 0 );
				let p32: number = sample( index_x, index_y, 0, 0 );
				let p33: number = sample( index_x, index_y, 1, 0 );

				// Sample and blend
				this.map[ index++ ] = bicubic(
					frac_x,
					frac_y,
					p00, p01, p02, p03,
					p10, p11, p12, p13,
					p20, p21, p22, p23,
					p30, p31, p32, p33,
				);
			}
		}

	}


	public sum_block( x: number, y: number, width: number, height: number ): number {
		/*
			Sum the rectangular data at these coordinates.
		*/

		if( x < 0 || x + width > this.width ){
			throw new RangeError( `PerlinTerrain.sum_block(): x coords out of range, we're ${ this.width }, input was ${ x } and ${ width } -> ${ x + width }` );
		}

		if( y < 0 || y + height > this.height ){
			throw new RangeError( `PerlinTerrain.sum_block(): y coords out of range, we're ${ this.height }, input was ${ y } and ${ height } -> ${ y + height }` );
		}

		let x_end: number = x + width;
		let y_end: number = y + height;
		let accumulator: number = 0;
		for( ; y < y_end; y++ ){
			for( let u = x; u < x_end; u++ ){
				accumulator += this.map[ u + ( y * this.width ) ];
			}
		}

		return accumulator;
	}


	public return_region_data( region: Region ): Float32Array {
		/*
			Grab this region of us and make it contiguous.
		*/

		let r_x = region.get_x();
		let r_y = region.get_y();
		let r_width = region.get_x_span();
		let r_height = region.get_y_span();

		if( r_x < 0 || r_x + r_width > this.width ){
			throw new RangeError( `PerlinTerrain.return_region_data(): x coords out of range, we're ${ this.width }, input was ${ r_x } and ${ r_width } -> ${ r_x + r_width }` );
		}

		if( r_y < 0 || r_y + r_height > this.height ){
			throw new RangeError( `PerlinTerrain.return_region_data(): y coords out of range, we're ${ this.height }, input was ${ r_y } and ${ r_height } -> ${ r_y + r_height }` );
		}
		
		let x_end: number = r_x + r_width;
		let y_end: number = r_y + r_height;
		let data: Float32Array = new Float32Array( r_width * r_height );
		let index: number = 0;

		for( let y = r_y; y < y_end; y++ ){
			for( let x = r_x; x < x_end; x++ ){
				data[ index++ ] = this.map[ x + ( y * this.width ) ];
			}
		}

		return data;
	}


	public get_region(): Region {
		/*
			Return a region that represents us
		*/
		return new Region( 0, 0, this.width, this.height );
	}



	/*
		Formatters
	*/

	public generate_plane_geometry( size: Vector3, origin: Vector3 ): THREE.PlaneGeometry {
		/*
			Fill out at scale (total x/z are plane scale, y is height scale) and origin (0,0,0 is centred)

			Plane is in the x/z plane with height data on y.

			NOTE: Origin and scale are baked into the vertex data
		*/
		let plane = new THREE.PlaneGeometry( size.x, size.z, this.width - 1, this.height - 1 );
		plane.rotateX( - Math.PI / 2 );

		// Fill out y data, it'll all be zero
		const verts = plane.attributes.position.array;

		for ( let i = 0, j = 0, l = verts.length; i < l; i++, j += 3 ) {

			// Set height
			verts[ j + 1 ] = this.map[ i ] * size.y;

			// Bake in origin
			verts[ j + 0 ] += origin.x;
			verts[ j + 1 ] += origin.y;
			verts[ j + 2 ] += origin.z;

			//console.debug( `${ verts[ j + 0 ] }, ${ verts[ j + 1 ] }, ${ verts[ j + 2 ] }` )
		}

		// Done
		return plane;
	}



	/*
		Properties
	*/

	public get_map(): Float32Array {
		return this.map;
	}

	public get_width(): number {
		return this.width;
	}

	public get_height(): number {
		return this.height;
	}

	public get_width_mask(): number {
		return this.width_mask;
	}

	public get_height_mask(): number {
		return this.height_mask;
	}

	public get_count(): number {
		return this.count;
	}
}


export {
	PerlinTerrain
}