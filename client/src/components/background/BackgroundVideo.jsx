import style from './BackgroundVideo.module.css';
import video from '../../../public/background-video/nav-background3.webm';
import poster from '../../../public/background-video/background-poster.png';

export default function BackgroundVideo() {
    return (
        <>
            <video className={style['background-video']} autoPlay loop muted poster={poster} >
                <source src={video} type="video/mp4" />
            </video>
        </>
    );
}