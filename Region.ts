import { generate_empty_2d_array } from './Utilities.js'


class Region {
	/*
		In-plane coordinate indices for terrain vertex locations relative to the original plane geometry.
	*/

	protected x: number;
	protected y: number;
	protected x_span: number;
	protected y_span: number;

	constructor(
		x: number,
		y: number,
		x_span: number,
		y_span: number,
	){
		/*
			Near enough
		*/
		this.x = Math.floor( x );
		this.y = Math.floor( y );
		this.x_span = Math.floor( x_span );
		this.y_span = Math.floor( y_span );
	}



	/*
		Geometry
	*/

	public subdivide_region( x_splits: number, y_splits: number ): Region[][] {
		/*
			Split nicely covering all original indices.

			NOTE: result is ranked [ y axis ][ x axis ]
		*/

		let regions: Region[][] = generate_empty_2d_array( x_splits, y_splits );

		let u_step = this.x_span / x_splits;
		let v_step = this.y_span / y_splits;

		for( let y = 0, v = this.y; y < y_splits; y++, v += v_step ){
			for( let x = 0, u = this.x; x < x_splits; x++, u += u_step ){

				regions[ y ][ x ] = new Region(
					u, v, u_step, v_step
				)

			}
		}

		return regions;
	}



	/*
		Helpers
	*/

	public is_equal( other: Region ): boolean {

		if( this.x == other.x && this.y == other.y && this.x_span == other.x_span && this.y_span == other.y_span ){
			return true;
		}

		return false;
	}



	/*
		Properties
	*/

	public get_x_span(): number {
		return this.x_span;
	}

	public get_y_span(): number {
		return this.y_span;
	}

	public get_x(): number {
		return this.x;
	}
	
	public get_y(): number {
		return this.y;
	}

}



export {
	Region	
}