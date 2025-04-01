import { Link } from 'react-router';
import styles from './ErrorPage.module.css'

export default function ErrorPage({ message, onReset }) {
    return (
        <div className={styles['error-container']}>
            <div className={styles.row}>
                <img
                    src='https://cdn.pixabay.com/photo/2024/04/26/13/53/dinosaur-8721921_1280.png'
                    alt='Friendly Dinosaur'
                    className={styles.dinosaur} />

                <div className={styles['error-message']}>{message}</div>
            </div>
            <button
                to={'/'}
                className={styles['home-link']}
                onClick={onReset}>
                <Link to={'/'}>Go to Home Page</Link>
            </button>
        </div>
    );
}