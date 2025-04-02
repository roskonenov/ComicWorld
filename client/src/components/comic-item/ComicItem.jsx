import { UseComicContext } from "../../contexts/ComicContext";
import { useUserContext } from "../../contexts/UserContext";
import styles from "./ComicItem.module.css"
import { Link } from "react-router";

export default function ComicItem({
    comic
}) {
    const { myComicsId } = useUserContext();
    const { buyComicHandler, readComicHandler } = UseComicContext();
    return (
        <li className={styles['item-container']}>
            <div className={styles['main-container']}>
                <div className={styles['cover-container']}>
                    <Link to={`/catalog/${comic._id}`}><img src={comic.coverUrl} className={styles.cover} /></Link>
                </div>
                <div className={styles['price-container']}>
                    <div className={styles['price-content']}>
                        <h4 className={styles['comic-title']}>{comic.title}</h4>
                        <p className={styles['comic-slogan']}>{comic.slogan}</p>
                        <p className={styles['current-price']}>${comic.currentPrice}</p>
                        {comic.oldPrice && <p className={styles['old-price']}>${comic.oldPrice}</p>}
                        <button
                            className={styles['buy-btn']}
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
        </li>
    );
}