import { useComic } from '../../api/comicApi';
import Spinner from '../spinner/Spinner';
import styles from './ComicDetails.module.css';
import { useParams } from 'react-router';
import StarRating from './star-rating/StarRating';

export default function ComicDetails() {
    const { comicId } = useParams();

    const [loading, comic] = useComic(comicId);
    console.log(comic);
    

    if (loading) {
        return <Spinner />;
    }
    return (
        <section className={styles['details-section']}>
            <div className={styles['details-container']}>
                <div className={styles['cover-container']}>
                    <div className={styles.cover}>
                        <img src={comic.coverUrl} alt={`cover page fo ${comic.title}`} />
                    </div>
                    <StarRating />
                </div>
                <div className={styles['info-container']}></div>
            </div>
        </section>
    );
}