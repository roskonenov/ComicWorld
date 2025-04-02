import NavItem from './nav-item/NavItem';
import styles from './Navigation.module.css';
import { useUserContext } from '../../../contexts/UserContext';

export default function Navigation() {
    const { username } = useUserContext();
    const navItems = [
        { name: 'Home', path: '/' },
        { name: 'All Comics', path: '/catalog' },
        { name: 'My Comics', path: '/my-comics', auth: true },
        { name: 'Login', path: '/login', auth: false },
        { name: 'Register', path: '/register', auth: false },
        { name: 'Logout', path: '/logout', auth: true },
        // { name: 'Contacts', path: '/contacts' },
        { name: 'About', path: '/about' },
    ];

    return (
        <nav className={styles.nav}>
            <ul className={styles.list}>
                {navItems.filter(item => item.auth === undefined || item.auth === !!username)
                .map(item => <NavItem key={item.name} item={item} />)}
                <p className={styles.greetings}>Hello: {username? username : 'Guest'}</p>
            </ul>
        </nav>
    );
}