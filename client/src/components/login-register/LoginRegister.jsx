import { useLocation, useNavigate } from 'react-router';
import styles from './LoginRegister.module.css';
import { useActionState, useEffect, useState } from 'react';
import { useLogin, useRegister } from '../../api/authenticationApi';
import { useUserContext } from '../../contexts/UserContext';
import { toast } from 'react-toastify';

export default function LoginRegister() {

    const location = useLocation().pathname;
    const navigate = useNavigate();
    const [isChecked, setIsChecked] = useState(false);
    const { login } = useLogin();
    const { register } = useRegister();
    const { userLoginHandler } = useUserContext();

    useEffect(() => {
        setIsChecked(location === '/login');
    }, [location]);

    function checkboxChangeHandler() {
        setIsChecked(i => i ? false : true);
        navigate(isChecked ? '/register' : '/login');
    }

    async function loginHandler(_, formData) {
        const { email, password } = Object.fromEntries(formData);
        await login(email, password)
            .then(authData => {
                userLoginHandler(authData);
                toast.success('Successful login');
                navigate(-1);
            })
            .catch(err => toast.error(err.message));
    }

    async function registerHandler(_, formData) {
        const { username, email, password, repeatPassword } = Object.fromEntries(formData);

        if (password !== repeatPassword) {
            return toast.error('Passwords must be equal')
        }

        await register(username, email, password)
            .then(authData => {
                userLoginHandler(authData);
                toast.success('Success! Welcome a board');
                navigate('/');
            })
            .catch(err => toast.error(err.message));

    }

    const [_A, loginAction, isPendingLogin] = useActionState(loginHandler, { email: '', password: '' });

    const [_B, registerAction, isPendingRegister] = useActionState(registerHandler, { username: '', email: '', password: '', repeatPassword: '' });


    return (
        <div className={styles.container}>
            <div className={styles['form-container']}>
                <input
                    className={styles.change}
                    type="checkbox"
                    id="chk"
                    aria-hidden="true"
                    checked={isChecked}
                    onChange={checkboxChangeHandler}
                />

                <div className={styles.signup}>
                    <form action={registerAction}>
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
                            <input className={styles['input-field']} type="email" name="email" placeholder='' required />
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

                        <button className={styles['submit-btn']} disabled={isPendingRegister}>Sign up</button>
                    </form>
                </div>

                <div className={styles.login}>
                    <form id='login' action={loginAction}>
                        <label
                            className={`${styles.changer} ${isChecked ? styles['inactive-label'] : ""}`}
                            htmlFor="chk"
                            aria-hidden="true">
                            Login
                        </label>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="email" name="email" placeholder='' required />
                            <label htmlFor="email">Email</label>
                        </div>
                        <div className={styles['field-container']}>
                            <input className={styles['input-field']} type="password" name="password" required />
                            <label htmlFor="password">Password</label>
                        </div>

                        <button className={styles['submit-btn']} disabled={isPendingLogin}>Login</button>
                    </form>
                </div>
            </div>
        </div>
    );
}