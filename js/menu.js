(function() {

	var bodyEl = document.body,
		cover = document.querySelector( '.menu-cover' ),
		openbtn = document.querySelector( '.menu-button-open' ),
		closebtn = document.querySelector( '.menu-button-close' ),
		isOpen = false,

		morphEl = document.getElementById( 'morph-shape' ),
		s = Snap( morphEl.querySelector( 'svg' ) );
		path = s.select( 'path' );
		initialPath = this.path.attr('d'),
		steps = morphEl.getAttribute( 'data-morph-open' ).split( ';' );
		stepsTotal = steps.length;
		isAnimating = false;

	function init() {
		initEvents();
		initBoxEvents();
	}

	function initEvents() {
		openbtn.addEventListener( 'click', toggleMenu );
		// wrap-right menu button
		document.querySelector( '.menu-button' ).addEventListener( 'click', toggleMenu );
		if( closebtn ) {
			closebtn.addEventListener( 'click', toggleMenu );
		}

		// close the menu element if the target it's not the menu element or one of its descendants..
		cover.addEventListener( 'click', function(ev) {
			var target = ev.target;
			if( isOpen && target !== openbtn ) {
				toggleMenu();
			}
		});
	}

	function toggleMenu() {
		if( isAnimating ) return false;
		isAnimating = true;
		$('.menu-wrap').show();
		
		if( isOpen ) {
			
			classie.remove( bodyEl, 'show-menu' );

			$('.menu-cover').stop( true, true ).fadeOut( 260 );
			$('body').css( 'overflow', 'auto' );

			// revert menu link image box
			revert();

			// smoothly restore the menu edge
			path.animate( { 'path' : initialPath }, 280, mina.easeinout, function() {
				isAnimating = false;
				$('.menu-button-open').fadeIn( 160 );
			} );
		} else {
			// hide menu button
			$('.menu-button-open').hide();
			classie.add( bodyEl, 'show-menu' );
			
			// use one eased transition instead of the previous elastic bounce
			path.animate( { 'path' : steps[stepsTotal - 1] }, 360, mina.easeinout, function() {
				isAnimating = false;
			} );
			
			$('.menu-cover').stop( true, true ).fadeIn( 260 );
			$('body').css( 'overflow', 'hidden' );

			// 设置消息动画时间
			noticeAnimation();
			
			// 防止移动端滚动
			$('.menu-cover').on( 'touchmove', function(event){
				event.preventDefault();
			}, false );

			// 将菜单滚动条移动至顶端
			$('.menu').scrollTop( 0 );

		}
		isOpen = !isOpen;
	}

	function noticeAnimation() {
		let notice   = $('.menu-notice .notice span');
		if (notice.hasClass('finish')) return ;
		let duration = notice.width() / window.config.MenuNotice.speed;
		notice.css('animation-duration', duration + 's');
		notice.addClass('finish');
	}

	function initBoxEvents() {
		$('.menu-link .image').click(function() {
			$('.image-box').append('<img src="' + $(this).attr('data') + '">');
			$('.menu-link a').addClass('blur');
			$('.box').fadeIn(300, function() {
				$('.image-box').addClass('show');
			});
		});

		$('.image-box').click(function() {
			$('.image-box').removeClass('show').addClass('hide');
			setTimeout (function() {
				$('.box').fadeOut(300, function() {
					$('.image-box img').remove();
					$('.image-box').removeClass('hide');
				});
				$('.menu-link a').removeClass('blur');
			}, 600);
		});
	}

	function revert() {
		$('.box').css('display', 'none');
		$('.image-box').removeClass('show');
		$('.image-box img').remove();
		$('.menu-link a').removeClass('blur');
	}

	init();

})();
