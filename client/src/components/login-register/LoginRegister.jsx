import { useLocation, useNavigate } from 'react-router';
import styles from './LoginRegister.module.css';
import { useEffect, useState } from 'react';

export default function LoginRegister() {

    const location = useLocation().pathname;
    const navigate = useNavigate();
    const [isChecked, setIsChecked] = useState(false);

    useEffect(() => {
        setIsChecked(location === '/login');
    }, [location]);

    function checkboxChangeHandler() {
        setIsChecked(i => i ? false : true);
        navigate(isChecked ? '/register' : '/login');
    }

    return (
        <div className={styles.container}>
            <div className={styles['form-container']}>
                <input
                    className={styles.change}
                    type="checkbox"
                    id="chk"
                    aria-hidden="true"
                    checked={isChecked}
                    onClick={checkboxChangeHandler}
                />

                <div className={styles.signup}>
                    <form>
                        <label
                            className={`${styles.changer} ${!isChecked ? styles['inactive-label'] : ""}`}
                            htmlFor="chk"
                            aria-hidden="true"
                        >Register
                        </label>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="text" name="username" required />
                            <label htmlFor="username">Username</label>
                        </div>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="email" name="email" required />
                            <label htmlFor="email">Email</label>
                        </div>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="password" name="password" required />
                            <label htmlFor="password">Choose password</label>
                        </div>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="password" name="repeatPassword" required />
                            <label htmlFor="repeatPassword">Repeat password</label>
                        </div>

                        <button className={styles['submit-btn']}>Sign up</button>
                    </form>
                </div>

                <div className={styles.login}>
                    <form>
                        <label
                            className={`${styles.changer} ${isChecked ? styles['inactive-label'] : ""}`}
                            htmlFor="chk"
                            aria-hidden="true">
                            Login
                        </label>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="email" name="email" required />
                            <label htmlFor="email">Email</label>
                        </div>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="password" name="password" required />
                            <label htmlFor="password">Password</label>
                        </div>

                        <button className={styles['submit-btn']}>Login</button>
                    </form>
                </div>
            </div>
        </div>
    );
}