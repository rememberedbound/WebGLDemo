//************************************************************
/*
	Utilities
*/

function generate_empty_2d_array( x: number, y: number ): any[][] {
	/*
		Indexing is [ y ][ x ], CPU cache happy standard
	*/
	return [ ...Array( y ) ].map( e => Array( x ) );
}

function generate_empty_3d_array( x: number, y: number, z: number ): any[][][] {
	/*
		Indexing is [ z ][ y ][ x ], CPU cache happy standard
	*/
	return [ ...Array( z ) ].map( e => [ ...Array( y ) ].map( e => Array( x ) ) );

}


function power2_next_largest( input: number ): number {
	return Math.pow( 2, Math.ceil( Math.log( input ) / Math.log( 2 ) ) );
}

function bicubic(

	// x and y fractions through the samling texel
	xf: number,
	yf: number,

	// local neighbourhood of values
	p00: number, p01: number, p02: number, p03: number,
	p10: number, p11: number, p12: number, p13: number,
	p20: number, p21: number, p22: number, p23: number,
	p30: number, p31: number, p32: number, p33: number,
): number {
	let yf2 = yf * yf;
	let xf2 = xf * xf;
	let xf3 = xf * xf2;

	let x00 = p03 - p02 - p00 + p01;
	let x01 = p00 - p01 - x00;
	let x02 = p02 - p00;
	let x0 = x00 * xf3 + x01 * xf2 + x02 * xf + p01;

	let x10 = p13 - p12 - p10 + p11;
	let x11 = p10 - p11 - x10;
	let x12 = p12 - p10;
	let x1 = x10 * xf3 + x11 * xf2 + x12 * xf + p11;

	let x20 = p23 - p22 - p20 + p21;
	let x21 = p20 - p21 - x20;
	let x22 = p22 - p20;
	let x2 = x20 * xf3 + x21 * xf2 + x22 * xf + p21;

	let x30 = p33 - p32 - p30 + p31;
	let x31 = p30 - p31 - x30;
	let x32 = p32 - p30;
	let x3 = x30 * xf3 + x31 * xf2 + x32 * xf + p31;

	let y0 = x3 - x2 - x0 + x1;
	let y1 = x0 - x1 - y0;
	let y2 = x2 - x0;

	return y0 * yf * yf2 + y1 * yf2 + y2 * yf + x1;
}



//************************************************************
/*
	Toggle classes on and off to handle DOM based animations when showing and hiding elements
*/

function vis_is_visible( id: string ): boolean {

	let element = document.getElementById( id );
	if( element == null ){
		throw( `vis_is_visible(): id '${ id }' not found.` )
	}

	if( element.classList.contains( 'is_visible' ) ){

		return true;
	}

	return false;
}

function vis_show( id: string ): boolean {

	if( vis_is_visible( id ) ){
		return;
	}

	let element = document.getElementById( id );
	if( element == null ){
		throw( `vis_show(): id '${ id }' not found.` )
	}

	element.classList.add( 'is_visible' );
}

function vis_hide( id: string ): boolean {

	if( !vis_is_visible( id ) ){
		return;
	}

	let element = document.getElementById( id );
	if( element == null ){
		throw( `vis_hide(): id '${ id }' not found.` )
	}

	element.classList.remove( 'is_visible' );
}

function vis_toggle( id: string ): boolean {

	let element = document.getElementById( id );
	if( element == null ){
		throw( `vis_toggle(): id '${ id }' not found.` )
	}

	if( element.classList.contains( 'is_visible' ) ){
		vis_hide( id );
		return;
	}

	vis_show( id );
}



export {
	generate_empty_2d_array,
	generate_empty_3d_array,
	vis_hide,
	vis_is_visible,
	vis_show,
	vis_toggle,
	power2_next_largest,
	bicubic
}