import { Link } from 'react-router';
import styles from './Logo.module.css'

export default function Logo() {
    return (
        <div className={styles['logo-container']}>
            <Link to="/">
                <h1 className={styles.logo}>
                    <span>Comic</span>
                    <span>World</span>
                </h1>
            </Link>
        </div>
    );
}