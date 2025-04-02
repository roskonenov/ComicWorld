import { useComic } from '../../api/comicApi';
import Spinner from '../spinner/Spinner';
import styles from './ComicDetails.module.css';
import { useParams } from 'react-router';
import StarRating from './star-rating/StarRating';
import CommentSection from './comment- section/CommentSection';
import { useUserContext } from '../../contexts/UserContext';
import { UseComicContext } from '../../contexts/ComicContext';

export default function ComicDetails() {
    const { comicId } = useParams();
    const [loading, comic] = useComic(comicId);
    const { username } = useUserContext();
    const { buyComicHandler, readComicHandler } = UseComicContext();
    const {myComicsId} = useUserContext();

    const isAdmin = username === 'Admin';

    if (loading) {
        return <Spinner />;
    }

    if (!comic || Object.keys(comic).length === 0) {
        return <div className={styles['no-comics']}>No comic data available</div>;
    }
    return (
        <>
            <section className={styles['details-section']}>
                <div className={styles['details-container']}>
                    <div className={styles['cover-container']}>
                        <div className={styles.cover}>
                            <img src={comic.coverUrl} alt={`cover page fo ${comic.title}`} />
                        </div>
                        <StarRating ratingId={comic.ratingId} comicId={comic._id} />
                    </div>
                    <div className={styles['info-container']}>
                        <h2 className={styles['comic-title']}>{comic.title}</h2>
                        <h3 className={styles['comic-slogan']}>{comic.slogan}</h3>
                        <p className={styles['comic-creators']}>{`By ${comic.creators}`}</p>
                        <p className={styles['comic-info']}>{comic.info}</p>
                        <div className={comic.oldPrice ? styles['hot-offer'] : styles.price}>
                            {comic.oldPrice && <span>{`$${comic.oldPrice}`}</span>}
                            {`$${comic.currentPrice}`}</div>
                        <div className={styles.buttons}>
                            {isAdmin &&
                                <>
                                    <button className={styles.delete}>Delete</button>
                                    <button className={styles.edit}>Edit</button>
                                </>
                            }
                            <button
                                className={styles.buy}
                                onClick={myComicsId.includes(comic._id)
                                    ? () => readComicHandler(comic)
                                    : () => buyComicHandler(comic)}>
                                {myComicsId.includes(comic._id)
                                    ? 'Read'
                                    : 'Buy now'}
                            </button>
                        </div>
                    </div>
                </div>
            </section>
            <CommentSection comicId={comicId} />
        </>
    );
}