import styles from './Comment.module.css'
import background0 from '../../../../assets/bubble-templates/comment-background.png';
import background1 from '../../../../assets/bubble-templates/yelow-bubble.png';

export default function Comment({
    _ownerId,
    text,
    index,
}) {
    return (
        <div className={styles[`comment-container-${index % 2 === 0 ? 'even' : 'odd'}`]}>
            <div className={styles['comment-background']}>
                <img src={index % 2 === 0 ? background0 : background1} alt="" />
            </div>
            <p className={styles['username']}>{_ownerId}</p>
            <p className={styles['comment-text']}>{text}</p>
        </div>
    );
}