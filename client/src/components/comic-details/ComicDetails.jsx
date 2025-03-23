import { useComic } from '../../api/comicApi';
import Spinner from '../spinner/Spinner';
import styles from './ComicDetails.module.css';
import { useParams } from 'react-router';
import StarRating from './star-rating/StarRating';
import background1 from '../../assets/bubble-templates/comment-background.png';
import background2 from '../../assets/bubble-templates/blue-bubble.png';

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
                        <StarRating {...comic.rating} comicId={comic._id} />
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
                            <button className={styles.delete}>Delete</button>
                            <button className={styles.edit}>Edit</button>
                            <button className={styles.buy}>Buy</button>
                        </div>
                    </div>
                </div>
                <div className={styles['comments-container']}>
                    <h2 className={styles['comment-title']}>Cooments</h2>
                    <div className={styles['comments-wrapper']}>
                        <div className={styles['comment-container-odd']}>
                            <div className={styles['comment-background']}>
                                <img src={background1} alt="" />
                            </div>
                            <p className={styles['username']}>roskonenov</p>
                            <p className={styles['comment-text']}>Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry...Lorem Ipsum is simply dummy text of the printing and typesetting industry.</p>
                        </div>
                        <div className={styles['comment-container-even']}>
                            <div className={styles['comment-background']}>
                                <img src={background2} alt="" />
                            </div>
                            <p className={styles['username']}>roskonenov</p>
                            <p className={styles['comment-text']}>Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry.. Lorem Ipsum is simply dummy text of the printing and typesetting industry...</p>
                        </div>
                        <div className={styles['comment-container-odd']}>
                            <div className={styles['comment-background']}>
                                <img src={background1} alt="" />
                            </div>
                            <p className={styles['username']}>roskonenov</p>
                            <p className={styles['comment-text']}>Lorem Ipsum  </p>
                        </div>
                        <div className={styles['comment-container-even']}>
                            <div className={styles['comment-background']}>
                                <img src={background2} alt="" />
                            </div>
                            <p className={styles['username']}>roskonenov</p>
                            <p className={styles['comment-text']}>Lorem Ipsum is simply </p>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}