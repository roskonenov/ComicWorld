import styles from "./ComicItem.module.css"

export default function ComicItem({
    _id,
    coverUrl,
    title,
    slogan,
    currentPrice,
    oldPrice
}) {
    return (
        <li className={styles['item-container']}>
            <div className={styles['main-container']}>
                <div className={styles['cover-container']}>
                    <a href="#"><img src={coverUrl} className={styles.cover} /></a>
                </div>
                <div className={styles['price-container']}>
                    <div className={styles['price-content']}>
                        <h4 className={styles['comic-title']}>{title}</h4>
                        <p className={styles['comic-slogan']}>{slogan}</p>
                        <p className={styles['current-price']}>{currentPrice}</p>
                        {oldPrice && <p className={styles['old-price']}>{oldPrice}</p>}
                        <button className={styles['buy-btn']}>Buy now</button>
                    </div>
                </div>
            </div>
        </li>
    );
}