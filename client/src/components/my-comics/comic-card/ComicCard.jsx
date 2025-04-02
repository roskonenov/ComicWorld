import { UseComicContext } from '../../../contexts/ComicContext';
import styles from './ComicCard.module.css'
import { Link } from 'react-router'

export default function ComicCard({
    comic
}) {
    const {readComicHandler} = UseComicContext();
    return (
        <article className={styles['comic-card']}>
            <div className={styles['comic-cover']}>
                <Link to={`/catalog/${comic._id}`}>
                    <img src={comic.coverUrl} alt={`${comic.title} cover`} />
                </Link>
            </div>
            <div className={styles['comic-info']}>
                <h3 className={styles['comic-title']}>{comic.title}</h3>
                <p className={styles['comic-slogan']}>{comic.slogan}</p>
                <button 
                onClick={() => readComicHandler(comic)}
                className={styles['read-btn']}>Read</button>
            </div>
        </article>
    );
}