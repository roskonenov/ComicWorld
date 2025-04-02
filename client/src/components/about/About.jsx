import styles from './About.module.css'

export default function About() {
    return (
        <div className={styles['about-section']}>
            <div className={styles['about-info']}>
                <h1 className={styles['about-title']}>About Us</h1>
                <p className={styles['about-text']}>
                    Welcome to Comic World, the ultimate destination for comic book lovers! We are the #1 online<br/>
                    platform for buying, collecting, and reading comics from all genres. Whether you&apos;re a<br/>
                    fan of superheroes, fantasy, sci-fi, horror, or manga, we&apos;ve got something for everyone.<br/>
                    <br/>
                    Why Choose Us?<br/>
                        &nbsp;&nbsp;&nbsp;-&nbsp;Massive Library - Explore thousands of comics from top publishers and independent creators.<br/>
                        
                        &nbsp;&nbsp;&nbsp;-&nbsp;Instant Access - Buy and read your favorite comics anytime, anywhere.<br/>
                        
                        &nbsp;&nbsp;&nbsp;-&nbsp;Exclusive Releases - Get access to exclusive comics and limited-edition issues.<br/>
                        
                        &nbsp;&nbsp;&nbsp;-&nbsp;Seamless Reading Experience - Enjoy high-quality digital comics with smooth navigation and immersive features.<br/>
                        
                        &nbsp;&nbsp;&nbsp;-&nbsp;Great Deals & Discounts - Find amazing offers on your favorite comics.<br/>
                        <br/>
                    Join our growing community of passionate readers and experience comics like never before!<br/>
                </p>
            </div>
            <div className={styles['video-section']}>
                <iframe className={styles['about-video']} width="540" height="400"
                    src="https://www.youtube.com/embed/YaYo-fr2mvU?playlist=YaYo-fr2mvU&autoplay=1&mute=1&loop=1&controls=0&start=2&end=50" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share">
                </iframe>
            </div>
        </div>
    );
}