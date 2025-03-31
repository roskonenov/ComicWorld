import styles from './Comment.module.css'
import background0 from '../../../../assets/bubble-templates/comment-background.png';
import background1 from '../../../../assets/bubble-templates/yelow-bubble.png';
import { useUserContext } from '../../../../contexts/UserContext';

export default function Comment({
    _id,
    _ownerId,
    text,
    index,
    onEdit,
    onDelete,
}) {
    const { _id: userId } = useUserContext();
    const isOwner = _ownerId === userId;
    return (
        <div className={styles[`comment-container-${index % 2 === 0 ? 'even' : 'odd'}`]}>
            <div className={styles['comment-background']}>
                <img src={index % 2 === 0 ? background0 : background1} alt="" />
            </div>
            <p className={styles['username']}>{_ownerId}</p>
            <p className={styles['comment-text']}>{text}</p>
            {isOwner &&
                <div className={styles['comment-buttons']}>

                    <button
                        className={styles['edit-button']}
                        onClick={() => onEdit(_id)}><a href='#add-comment'>edit</a></button>

                    <button
                        className={styles['delete-button']}
                        onClick={() => onDelete(_id)}>x</button>
                </div>}
        </div>
    );
}