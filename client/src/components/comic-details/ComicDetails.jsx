import { useComic } from '../../api/comicApi';
import Spinner from '../spinner/Spinner';
import styles from './ComicDetails.module.css';
import { useParams } from 'react-router';
import StarRating from './star-rating/StarRating';

export default function ComicDetails() {
    const { comicId } = useParams();

    const [loading, comic] = useComic(comicId);

    if (loading) {
        return <Spinner />;
    }
    return (
        <>
            <section className={styles['details-section']}>
                <div className={styles['details-container']}>
                    <div className={styles['cover-container']}>
                        <div className={styles.cover}>
                            <img src={comic.coverUrl} alt={`cover page fo ${comic.title}`} />
                        </div>
                        <StarRating {...comic.rating} comicId={comic._id}/>
                    </div>
                    <div className={styles['info-container']}>
                        <h2 className={styles['comic-title']}>{comic.title}</h2>
                        <h3 className={styles['comic-slogan']}>{comic.slogan}</h3>
                        <p className={styles['comic-creators']}>{`By ${comic.creators}`}</p>
                        <p className={styles['comic-info']}>{comic.info}</p>
                    </div>
                </div>
            </section>
        </>
    );
}